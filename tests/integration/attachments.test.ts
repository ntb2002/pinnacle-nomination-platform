import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import type { Actor } from "@/server/auth/actor";
import { closeDb } from "@/server/db";
import {
  attachment,
  auditLog,
  awardCycle,
  conflictDeclaration,
  entry,
  judgeProfile,
} from "@/server/db/schema";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { storage } from "@/server/storage";
import {
  deleteAttachment,
  listAttachments,
  openAttachment,
  uploadAttachment,
  UploadRejected,
} from "@/server/services/attachments";
import { deleteDraft } from "@/server/services/entry-drafts";
import { createActor } from "../support/actors";
import { db, resetTables } from "../support/db";
import { assignJudge, createCategory, createEntry, createProgram } from "../support/factories";

beforeEach(async () => {
  await resetTables();
  // Start each test with empty storage (the test STORAGE_DIR, see vitest.config.ts).
  await rm(path.resolve(env().STORAGE_DIR), { recursive: true, force: true });
});
afterAll(closeDb);

const pdf = (body = "hello") => ({
  name: "results.pdf",
  bytes: new TextEncoder().encode(`%PDF-1.7\n${body}`),
});

async function setup() {
  const { cycle, category } = await createProgram();
  const owner = await createActor("NOMINATOR");
  const e = await createEntry({
    cycleId: cycle.id,
    categoryId: category.id,
    nominatorId: owner.id,
  });
  return { cycle, category, owner, entry: e };
}

async function uploaded(owner: Actor, entryId: string) {
  await uploadAttachment(owner, entryId, pdf());
  const [row] = await db.select().from(attachment).where(eq(attachment.entryId, entryId));
  return row!;
}

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (err: unknown) => (err instanceof UploadRejected ? err.code : err),
  );

describe("uploading", () => {
  it("stores the bytes under a random key with a sniffed type and checksum", async () => {
    const { owner, entry } = await setup();
    await uploadAttachment(owner, entry.id, { name: "../x/Report.html", bytes: pdf().bytes });
    const [row] = await db.select().from(attachment).where(eq(attachment.entryId, entry.id));
    expect(row).toMatchObject({
      originalName: "Report.html.pdf",
      contentType: "application/pdf",
      sizeBytes: pdf().bytes.byteLength,
    });
    expect(row!.storageKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(row!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await storage().get(row!.storageKey)).toEqual(pdf().bytes);
  });

  it("refuses wrong types, empty and oversized files", async () => {
    const { owner, entry } = await setup();
    const html = { name: "a.pdf", bytes: new TextEncoder().encode("<html>") };
    expect(await rejection(uploadAttachment(owner, entry.id, html))).toBe("type");
    const empty = { name: "a.pdf", bytes: new Uint8Array() };
    expect(await rejection(uploadAttachment(owner, entry.id, empty))).toBe("empty");
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-"));
    expect(await rejection(uploadAttachment(owner, entry.id, { name: "b.pdf", bytes: big }))).toBe(
      "size",
    );
  });

  it("allows at most five files per entry", async () => {
    const { owner, entry } = await setup();
    for (let i = 0; i < 5; i++) await uploadAttachment(owner, entry.id, pdf(String(i)));
    expect(await rejection(uploadAttachment(owner, entry.id, pdf()))).toBe("count");
  });

  it("keeps the five-file limit under concurrent uploads", async () => {
    const { owner, entry: e } = await setup();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => uploadAttachment(owner, e.id, pdf(String(i)))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await db.select().from(attachment)).toHaveLength(5);
    // The refused upload's bytes were removed again: only five files on disk.
    const dir = path.resolve(env().STORAGE_DIR);
    const stored = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((d) =>
      d.isFile(),
    );
    const keys = new Set((await db.select().from(attachment)).map((r) => r.storageKey));
    expect(stored.filter((d) => keys.has(d.name))).toHaveLength(5);
    expect(stored.filter((d) => !keys.has(d.name))).toEqual([]);
  });

  it("refuses another nominator's entry, a submitted entry, and other roles", async () => {
    const { owner, entry, cycle, category } = await setup();
    const other = await createActor("NOMINATOR");
    expect(await rejection(uploadAttachment(other, entry.id, pdf()))).toBe("closed");
    const submitted = await createEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: owner.id,
      status: "SUBMITTED",
    });
    expect(await rejection(uploadAttachment(owner, submitted.id, pdf()))).toBe("closed");
    const admin = await createActor("ADMIN");
    await expect(uploadAttachment(admin, entry.id, pdf())).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(attachment)).toHaveLength(0);
  });
});

describe("downloading", () => {
  it("lets the owner and admins download; admin downloads are audited", async () => {
    const { owner, entry } = await setup();
    const row = await uploaded(owner, entry.id);
    expect((await openAttachment(owner, row.id)).name).toBe("results.pdf");
    const admin = await createActor("ADMIN");
    await openAttachment(admin, row.id, "203.0.113.9");
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "attachment.downloaded"));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: admin.id, targetId: row.id, ip: "203.0.113.9" });
  });

  it("lets an assigned judge with no conflict download from an approved entry", async () => {
    const { owner, entry: e, category } = await setup();
    const row = await uploaded(owner, e.id);
    await db.update(entry).set({ status: "APPROVED" }).where(eq(entry.id, e.id));
    const judge = await createActor("JUDGE");
    // #11 tightened the judge rule (agreed in #8's review): judges need an active profile
    // and read content only once their round opens. Set that up; assertions unchanged.
    await db.insert(judgeProfile).values({ userId: judge.id, displayName: "Test Judge" });
    await db.update(awardCycle).set({ phase: "ROUND1_OPEN" }).where(eq(awardCycle.id, e.cycleId));
    // Not assigned yet, then assigned but no declaration yet.
    await expect(openAttachment(judge, row.id)).rejects.toBeInstanceOf(NotFoundError);
    await assignJudge(judge.id, category.id);
    await expect(openAttachment(judge, row.id)).rejects.toBeInstanceOf(NotFoundError);
    await db
      .insert(conflictDeclaration)
      .values({ judgeId: judge.id, entryId: e.id, hasConflict: false });
    expect((await openAttachment(judge, row.id)).contentType).toBe("application/pdf");
    expect(await listAttachments(judge, e.id)).toHaveLength(1);
    const logs = await db.select().from(auditLog).where(eq(auditLog.actorId, judge.id));
    expect(logs.map((l) => l.action)).toEqual(["attachment.downloaded"]);
  });

  it("denies a recused judge and a judge from another category", async () => {
    const { owner, entry: e, category, cycle } = await setup();
    const row = await uploaded(owner, e.id);
    await db.update(entry).set({ status: "APPROVED" }).where(eq(entry.id, e.id));
    const recused = await createActor("JUDGE");
    await assignJudge(recused.id, category.id);
    await db.insert(conflictDeclaration).values({
      judgeId: recused.id,
      entryId: e.id,
      hasConflict: true,
      reason: "Former colleague",
    });
    await expect(openAttachment(recused, row.id)).rejects.toBeInstanceOf(NotFoundError);
    const elsewhere = await createActor("JUDGE");
    const otherCategory = await createCategory(cycle.id);
    await assignJudge(elsewhere.id, otherCategory.id);
    await db
      .insert(conflictDeclaration)
      .values({ judgeId: elsewhere.id, entryId: e.id, hasConflict: false });
    await expect(openAttachment(elsewhere, row.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("denies other nominators, unassigned, undeclared or conflicted judges, and bad ids", async () => {
    const { owner, entry, category } = await setup();
    const row = await uploaded(owner, entry.id);
    const other = await createActor("NOMINATOR");
    await expect(openAttachment(other, row.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listAttachments(other, entry.id)).rejects.toBeInstanceOf(NotFoundError);
    const judge = await createActor("JUDGE");
    await assignJudge(judge.id, category.id);
    await db
      .insert(conflictDeclaration)
      .values({ judgeId: judge.id, entryId: entry.id, hasConflict: false });
    // Still a draft: judges never see entries before approval.
    await expect(openAttachment(judge, row.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(openAttachment(owner, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    await expect(openAttachment(owner, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("removing", () => {
  it("removes the row and the stored bytes, only for the owner", async () => {
    const { owner, entry } = await setup();
    const row = await uploaded(owner, entry.id);
    const other = await createActor("NOMINATOR");
    await expect(deleteAttachment(other, row.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteAttachment(owner, row.id);
    expect(await db.select().from(attachment)).toHaveLength(0);
    expect(await storage().get(row.storageKey)).toBeNull();
  });

  it("refuses removal once the entry is submitted", async () => {
    const { owner, entry: e } = await setup();
    const row = await uploaded(owner, e.id);
    await db.update(entry).set({ status: "SUBMITTED" }).where(eq(entry.id, e.id));
    await expect(deleteAttachment(owner, row.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await storage().get(row.storageKey)).not.toBeNull();
  });

  it("deleting a draft removes its stored files too", async () => {
    const { owner, entry } = await setup();
    const row = await uploaded(owner, entry.id);
    await deleteDraft(owner, entry.id);
    expect(await storage().get(row.storageKey)).toBeNull();
  });
});
