import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { closeDb } from "@/server/db";
import {
  attachment,
  auditLog,
  awardCycle,
  conflictDeclaration,
  emailOutbox,
  entry,
  judgeProfile,
  payment,
  user,
} from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { openAttachment } from "@/server/services/attachments";
import {
  clearConflict,
  coverageWarnings,
  declarationsForJudge,
  declareConflict,
  recordConflict,
} from "@/server/services/conflicts";
import { setAssignments, setJudgeActive } from "@/server/services/judge-assignments";
import { inviteJudge, updateJudgeProfile } from "@/server/services/judges-admin";
import { getJudgeEntry, getJudgeHome, getJudgeQueue } from "@/server/services/judging";
import { grantRole } from "@/server/services/users";
import { createActor } from "../support/actors";
import { db, resetTables } from "../support/db";
import { createCategory, createCompleteEntry, createCycle, createUser } from "../support/factories";

beforeEach(resetTables);
afterAll(closeDb);

async function judge(admin: Actor, email: string): Promise<Actor> {
  const id = await inviteJudge(admin, {
    email,
    displayName: "Jordan Panel",
    title: "Partner",
    organization: "Example Ventures",
  });
  return { id, email, name: "Jordan Panel", role: "JUDGE" };
}

async function setup() {
  const cycle = await createCycle();
  const cat = await createCategory(cycle.id);
  const admin = await createActor("ADMIN");
  const nominator = await createActor("NOMINATOR");
  const a = await createCompleteEntry({
    cycleId: cycle.id,
    categoryId: cat.id,
    nominatorId: nominator.id,
  });
  const b = await createCompleteEntry({
    cycleId: cycle.id,
    categoryId: cat.id,
    nominatorId: nominator.id,
  });
  await db
    .update(entry)
    .set({ status: "APPROVED", submittedAt: new Date() })
    .where(eq(entry.cycleId, cycle.id));
  const j = await judge(admin, "jordan.panel@example.org");
  await setAssignments(admin, j.id, 1, [cat.id]);
  return { cycle, category: cat, admin, nominator, a, b, judge: j };
}
const openRound1 = (cycleId: string) =>
  db.update(awardCycle).set({ phase: "ROUND1_OPEN" }).where(eq(awardCycle.id, cycleId));
const noConflict = { conflict: "no" };
const conflict = { conflict: "yes", reason: "Former colleague of the nominee" };

describe("panel management", () => {
  it("invites a judge with a profile and an email", async () => {
    const { judge: j } = await setup();
    const [u] = await db.select().from(user).where(eq(user.id, j.id));
    expect(u).toMatchObject({ role: "JUDGE", email: "jordan.panel@example.org" });
    const [p] = await db.select().from(judgeProfile).where(eq(judgeProfile.userId, j.id));
    expect(p).toMatchObject({ displayName: "Jordan Panel", active: true, isPublic: false });
    const mail = await db.select().from(emailOutbox).where(eq(emailOutbox.toAddress, j.email));
    expect(mail[0]?.subject).toBe("You are invited to judge the Pinnacle Awards");
  });

  it("refuses judges who submitted nominations this cycle (role grant, invite and assignment)", async () => {
    const { admin, nominator, category: cat } = await setup();
    await expect(grantRole(admin, nominator.email, "JUDGE")).rejects.toBeInstanceOf(ConflictError);
    await expect(
      inviteJudge(admin, {
        email: nominator.email,
        displayName: "Nominator Person",
        title: "",
        organization: "",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    // Someone already a judge who somehow has entries cannot be assigned.
    const odd = await createUser("JUDGE");
    await createCompleteEntry({
      cycleId: cat.cycleId,
      categoryId: cat.id,
      nominatorId: odd.id,
    }).then((e) => db.update(entry).set({ status: "SUBMITTED" }).where(eq(entry.id, e.id)));
    await db.insert(judgeProfile).values({ userId: odd.id, displayName: "Odd" });
    await expect(setAssignments(admin, odd.id, 1, [cat.id])).rejects.toBeInstanceOf(ConflictError);
    expect((await db.select().from(user).where(eq(user.id, nominator.id)))[0]!.role).toBe(
      "NOMINATOR",
    );
  });

  it("edits profiles, assigns per round and is admin-only", async () => {
    const { admin, judge: j, category: cat, nominator } = await setup();
    await updateJudgeProfile(admin, j.id, {
      displayName: "Jordan P.",
      title: "GP",
      organization: "Ex",
      bio: "Bio",
      isPublic: true,
      sortOrder: "2",
    });
    await setAssignments(admin, j.id, 2, [cat.id]);
    const home = await getJudgeHome(j);
    expect(home.assignments.map((a) => a.round)).toEqual([1, 2]);
    await expect(setAssignments(nominator, j.id, 1, [])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setAssignments(admin, j.id, 1, ["not-a-uuid"])).rejects.toBeInstanceOf(
      ValidationError,
    );
    const audits = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.targetId, j.id));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "judge.invited",
        "judge.profile_updated",
        "judge.assignments_updated",
      ]),
    );
  });
});

describe("conflict of interest", () => {
  it("shows only name, title and company before declaring; no content until declared clear and the round opens", async () => {
    const { judge: j, a, category: cat, cycle } = await setup();
    const q = await getJudgeQueue(j, cat.id, 1);
    expect(Object.keys(q.queue[0]!).sort()).toEqual([
      "hasConflict",
      "id",
      "nomineeCompany",
      "nomineeName",
      "nomineeTitle",
      "scored",
    ]);
    await expect(getJudgeEntry(j, a.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    await declareConflict(j, a.id, noConflict);
    await expect(getJudgeEntry(j, a.id, 1)).rejects.toBeInstanceOf(NotFoundError); // round not open yet
    await openRound1(cycle.id);
    const view = await getJudgeEntry(j, a.id, 1);
    // Least privilege: no contact details, nominator or payments in the judge payload.
    const json = JSON.stringify(view);
    expect(json).not.toContain("morgan.ellis@example.org");
    expect(json).not.toContain("+1 315 555 0142");
    expect(json).not.toContain(a.nomineeEmail!);
    expect(view).not.toHaveProperty("nominatorId");
    expect(json).not.toContain(
      (await db.select().from(user).where(eq(user.id, a.nominatorId)))[0]!.email,
    );
    expect(view.references[0]).toEqual({
      position: 1,
      name: "Morgan Ellis",
      title: "VP, Partnerships",
      organization: "Example Brand Co.",
      relationship: "Brand partner for three years",
    });
    const viewed = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "entry.viewed_by_judge"));
    expect(viewed).toHaveLength(1);
  });

  it("recuses a conflicted judge on every path, and a judge cannot undo it", async () => {
    const { judge: j, a, b, cycle, category: cat, nominator } = await setup();
    await openRound1(cycle.id);
    await declareConflict(j, a.id, conflict);
    await declareConflict(j, b.id, noConflict);
    const [file] = await db
      .insert(attachment)
      .values({
        entryId: a.id,
        storageKey: crypto.randomUUID(),
        originalName: "x.pdf",
        contentType: "application/pdf",
        sizeBytes: 1,
        sha256: "d".repeat(64),
        uploadedById: nominator.id,
      })
      .returning();
    await expect(getJudgeEntry(j, a.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    await expect(openAttachment(j, file!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(declareConflict(j, a.id, noConflict)).rejects.toBeInstanceOf(ConflictError);
    const q = await getJudgeQueue(j, cat.id, 1);
    expect(q.queue.map((r) => r.id)).toEqual([b.id]);
    expect(q.recused.map((r) => r.id)).toEqual([a.id]);
    const home = await getJudgeHome(j);
    expect(home.assignments[0]).toMatchObject({ total: 1, recused: 1 });
    await getJudgeEntry(j, b.id, 1);
  });

  it("lets a judge change 'no conflict' to 'conflict' later, recusing them at once", async () => {
    const { judge: j, a, cycle } = await setup();
    await openRound1(cycle.id);
    await declareConflict(j, a.id, noConflict);
    await getJudgeEntry(j, a.id, 1);
    await declareConflict(j, a.id, conflict);
    await expect(getJudgeEntry(j, a.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    const [d] = await db
      .select()
      .from(conflictDeclaration)
      .where(eq(conflictDeclaration.entryId, a.id));
    expect(d).toMatchObject({ hasConflict: true, reason: conflict.reason });
    const actions = (await db.select().from(auditLog).where(eq(auditLog.actorId, j.id))).map(
      (r) => r.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(["conflict.declared", "conflict.changed_to_conflict"]),
    );
  });

  it("requires a reason for a conflict; unassigned, inactive and round-2-only judges are forbidden", async () => {
    const { admin, judge: j, a, cycle, category: cat } = await setup();
    await openRound1(cycle.id);
    await expect(declareConflict(j, a.id, { conflict: "yes", reason: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const other = await judge(admin, "other.judge@example.org");
    await expect(declareConflict(other, a.id, noConflict)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJudgeQueue(other, cat.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    // Round 2 judges only see finalists.
    await setAssignments(admin, other.id, 2, [cat.id]);
    await expect(declareConflict(other, a.id, noConflict)).rejects.toBeInstanceOf(NotFoundError);
    await declareConflict(j, a.id, noConflict);
    await setJudgeActive(admin, j.id, false);
    await expect(getJudgeEntry(j, a.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getJudgeHome(j)).active).toBe(false);
  });

  it("lists every approved entry in the judge's categories once, with their declaration", async () => {
    const { admin, judge: j, a, b, category: cat } = await setup();
    await setAssignments(admin, j.id, 2, [cat.id]); // both rounds: still one row per entry
    await declareConflict(j, a.id, conflict);
    const rows = await declarationsForJudge(admin, j.id);
    expect(rows.map((r) => r.entryId).sort()).toEqual([a.id, b.id].sort());
    expect(rows.find((r) => r.entryId === a.id)).toMatchObject({
      hasConflict: true,
      reason: conflict.reason,
    });
    expect(rows.find((r) => r.entryId === b.id)?.hasConflict).toBeNull();
    await expect(declarationsForJudge(j, j.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admins record and clear recusals with reasons, all audited", async () => {
    const { admin, judge: j, a, cycle } = await setup();
    await openRound1(cycle.id);
    await recordConflict(admin, j.id, a.id, { reason: "Disclosed by email to the team" });
    await expect(getJudgeEntry(j, a.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    await expect(clearConflict(admin, j.id, a.id, { reason: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await clearConflict(admin, j.id, a.id, { reason: "Checked: different person, same name" });
    await getJudgeEntry(j, a.id, 1);
    const [d] = await db
      .select()
      .from(conflictDeclaration)
      .where(and(eq(conflictDeclaration.entryId, a.id), eq(conflictDeclaration.judgeId, j.id)));
    expect(d).toMatchObject({
      hasConflict: false,
      recordedById: admin.id,
      adminNote: "Checked: different person, same name",
    });
    const actions = (await db.select().from(auditLog).where(eq(auditLog.actorId, admin.id))).map(
      (r) => r.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(["conflict.recorded_by_admin", "conflict.cleared"]),
    );
  });
});

describe("coverage", () => {
  it("warns when an approved entry has fewer than 2 eligible judges", async () => {
    const { admin, judge: j, a, b, category: cat } = await setup();
    // One judge: both entries are under-covered.
    expect((await coverageWarnings(admin)).map((w) => w.entryId).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    const second = await judge(admin, "second.judge@example.org");
    await setAssignments(admin, second.id, 1, [cat.id]);
    expect(await coverageWarnings(admin)).toEqual([]);
    // A recusal drops entry a back below two.
    await declareConflict(second, a.id, conflict);
    expect(await coverageWarnings(admin)).toMatchObject([{ entryId: a.id, round: 1, eligible: 1 }]);
    await setJudgeActive(admin, j.id, false);
    expect((await coverageWarnings(admin)).map((w) => w.entryId).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    await expect(coverageWarnings(j)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("review regressions", () => {
  it("refuses a judge from another category, even with a profile, no conflict and the round open", async () => {
    const { admin, a, nominator, cycle } = await setup();
    await openRound1(cycle.id);
    const otherCat = await createCategory(cycle.id);
    const outsider = await judge(admin, "outsider@example.org");
    await setAssignments(admin, outsider.id, 1, [otherCat.id]);
    await db
      .insert(conflictDeclaration)
      .values({ judgeId: outsider.id, entryId: a.id, hasConflict: false });
    const [file] = await db
      .insert(attachment)
      .values({
        entryId: a.id,
        storageKey: crypto.randomUUID(),
        originalName: "x.pdf",
        contentType: "application/pdf",
        sizeBytes: 1,
        sha256: "e".repeat(64),
        uploadedById: nominator.id,
      })
      .returning();
    await expect(openAttachment(outsider, file!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJudgeEntry(outsider, a.id, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to make someone a judge while their checkout is open", async () => {
    const { admin, category: cat } = await setup();
    const payer = await createActor("NOMINATOR");
    const draft = await createCompleteEntry({
      cycleId: cat.cycleId,
      categoryId: cat.id,
      nominatorId: payer.id,
    });
    await db.insert(payment).values({
      entryId: draft.id,
      kind: "ENTRY_FEE",
      tier: "EARLY",
      amountCents: 50_000,
      provider: "mock",
      providerSessionId: "mock_cs_open",
      createdById: payer.id,
      expiresAt: new Date(Date.now() + 20 * 60_000),
    });
    const err = await inviteJudge(admin, {
      email: payer.email,
      displayName: "Payer Person",
      title: "",
      organization: "",
    }).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).publicMessage).toMatch(/paying for a nomination/);
    await expect(grantRole(admin, payer.email, "JUDGE")).rejects.toBeInstanceOf(ConflictError);
  });

  it("gives no access to a past cycle's entries", async () => {
    const { judge: j, a, cycle } = await setup();
    await openRound1(cycle.id);
    await declareConflict(j, a.id, noConflict);
    await getJudgeEntry(j, a.id, 1);
    await db.update(awardCycle).set({ isActive: false }).where(eq(awardCycle.id, cycle.id));
    await expect(getJudgeEntry(j, a.id, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps a judge who has declared from becoming a nominator this cycle; re-invites never reactivate", async () => {
    const { admin, judge: j, a } = await setup();
    await declareConflict(j, a.id, noConflict);
    await expect(grantRole(admin, j.email, "NOMINATOR")).rejects.toBeInstanceOf(ConflictError);
    await setJudgeActive(admin, j.id, false);
    await inviteJudge(admin, {
      email: j.email,
      displayName: "Jordan Panel",
      title: "Partner",
      organization: "Example Ventures",
    });
    expect(
      (await db.select().from(judgeProfile).where(eq(judgeProfile.userId, j.id)))[0]!.active,
    ).toBe(false);
    const disabled = await createUser("NOMINATOR", { disabledAt: new Date() });
    await expect(
      inviteJudge(admin, {
        email: disabled.email,
        displayName: "Disabled Person",
        title: "",
        organization: "",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("audits the judge's reason, and recording on a missing entry is NotFound", async () => {
    const { admin, judge: j, a } = await setup();
    await declareConflict(j, a.id, conflict);
    const [row] = await db.select().from(auditLog).where(eq(auditLog.action, "conflict.declared"));
    expect(row!.metadata).toMatchObject({ hasConflict: true, reason: conflict.reason });
    await expect(
      recordConflict(admin, j.id, crypto.randomUUID(), { reason: "Known relationship here" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
