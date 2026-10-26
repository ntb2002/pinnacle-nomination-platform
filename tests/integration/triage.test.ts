import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { closeDb } from "@/server/db";
import {
  auditLog,
  awardCycle,
  emailOutbox,
  entry,
  entryStatusEvent,
  payment,
} from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { saveDraft } from "@/server/services/entry-drafts";
import { getMyTimeline, moveReturnedEntry } from "@/server/services/returned-entries";
import { approveEntry, resubmitEntry, returnEntry } from "@/server/services/triage";
import { getAdminEntry, listTriageQueue, parseQueueFilters } from "@/server/services/triage-queue";
import { createActor } from "../support/actors";
import { db, resetTables } from "../support/db";
import { createCategory, createCompleteEntry, createCycle } from "../support/factories";

beforeEach(resetTables);
afterAll(closeDb);

/** A paid, submitted entry, as the webhook leaves it. */
async function submitted(cycleId: string, categoryId: string, nominator: Actor) {
  const e = await createCompleteEntry({ cycleId, categoryId, nominatorId: nominator.id });
  await db
    .update(entry)
    .set({ status: "SUBMITTED", submittedAt: new Date() })
    .where(eq(entry.id, e.id));
  await db.insert(payment).values({
    entryId: e.id,
    kind: "ENTRY_FEE",
    tier: "EARLY",
    amountCents: 50_000,
    status: "PAID",
    provider: "mock",
    providerSessionId: `cs_${e.id}`,
    createdById: nominator.id,
    paidAt: new Date(),
  });
  await db
    .insert(entryStatusEvent)
    .values({ entryId: e.id, fromStatus: "DRAFT", toStatus: "SUBMITTED" });
  return e;
}

async function setup() {
  const cycle = await createCycle();
  const cat = await createCategory(cycle.id);
  const other = await createCategory(cycle.id);
  const nominator = await createActor("NOMINATOR");
  const admin = await createActor("ADMIN");
  const e = await submitted(cycle.id, cat.id, nominator);
  return { cycle, category: cat, other, nominator, admin, entry: e };
}

const statusOf = async (id: string) =>
  (await db.select().from(entry).where(eq(entry.id, id)))[0]!.status;
const mailTo = (to: string) => db.select().from(emailOutbox).where(eq(emailOutbox.toAddress, to));
const RETURN = { reason: "INCOMPLETE", message: "Please add a data point for the second outcome." };

describe("triage state machine", () => {
  it("approves a submitted entry, records who, audits and emails the nominator", async () => {
    const { admin, nominator, entry: e } = await setup();
    await approveEntry(admin, e.id, { note: "Looks complete" }, "203.0.113.5");
    expect(await statusOf(e.id)).toBe("APPROVED");
    const [ev] = await db
      .select()
      .from(entryStatusEvent)
      .where(and(eq(entryStatusEvent.entryId, e.id), eq(entryStatusEvent.toStatus, "APPROVED")));
    expect(ev).toMatchObject({
      fromStatus: "SUBMITTED",
      actorId: admin.id,
      note: "Looks complete",
    });
    const [a] = await db.select().from(auditLog).where(eq(auditLog.action, "entry.approved"));
    expect(a).toMatchObject({ actorId: admin.id, targetId: e.id, ip: "203.0.113.5" });
    const mail = await mailTo(nominator.email);
    expect(mail.map((m) => m.subject)).toEqual([expect.stringMatching(/^Accepted for judging/)]);
  });

  it("rejects illegal transitions", async () => {
    const { admin, nominator, entry: e, cycle, category } = await setup();
    await approveEntry(admin, e.id);
    await expect(approveEntry(admin, e.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(returnEntry(admin, e.id, RETURN)).rejects.toBeInstanceOf(ConflictError);
    const draft = await createCompleteEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: nominator.id,
    });
    await expect(approveEntry(admin, draft.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(resubmitEntry(nominator, draft.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(approveEntry(admin, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("requires a reason and a message to return", async () => {
    const { admin, entry: e } = await setup();
    const err = await returnEntry(admin, e.id, { reason: "", message: "short" }).catch(
      (x: unknown) => x,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys((err as ValidationError).fieldErrors).sort()).toEqual(["message", "reason"]);
    expect(await statusOf(e.id)).toBe("SUBMITTED");
  });

  it("returns with a message, and resubmission needs no second payment", async () => {
    const { admin, nominator, entry: e } = await setup();
    await returnEntry(admin, e.id, RETURN);
    expect(await statusOf(e.id)).toBe("RETURNED");
    const [returned] = await mailTo(nominator.email);
    expect(returned!.textBody).toContain(RETURN.message);
    // The nominator sees the message, but not who returned it.
    const timeline = await getMyTimeline(nominator, e.id);
    expect(timeline.at(-1)).toMatchObject({
      toStatus: "RETURNED",
      returnReason: "INCOMPLETE",
      message: RETURN.message,
    });
    expect(JSON.stringify(timeline)).not.toContain(admin.id);

    await saveDraft(nominator, e.id, {
      nomineeName: "Pat Changed",
      nomineeTitle: "Chief Executive Officer",
      nomineeCompany: "Example Media Co.",
      nomineeEmail: "someone.else@example.com",
      narrative: (await db.select().from(entry).where(eq(entry.id, e.id)))[0]!.narrative!,
      outcomes: [
        { description: "Grew creator revenue", dataPoint: "+48% YoY" },
        { description: "Expanded the partner program", dataPoint: "120 partners, up from 40" },
      ],
      references: [
        {
          name: "Morgan Ellis",
          title: "VP, Partnerships",
          organization: "Example Brand Co.",
          email: "morgan.ellis@example.org",
          phone: "+1 315 555 0142",
          relationship: "Brand partner for three years",
        },
      ],
    });
    const [after] = await db.select().from(entry).where(eq(entry.id, e.id));
    // The nominee the fee was paid for stays: the email cannot change after submission.
    expect(after!.nomineeEmail).toBe(e.nomineeEmail);

    await resubmitEntry(nominator, e.id);
    expect(await statusOf(e.id)).toBe("SUBMITTED");
    expect(await db.select().from(payment).where(eq(payment.entryId, e.id))).toHaveLength(1);
    const [ev] = await db
      .select()
      .from(entryStatusEvent)
      .where(and(eq(entryStatusEvent.entryId, e.id), eq(entryStatusEvent.fromStatus, "RETURNED")));
    expect(ev!.note).toBe("Changed: Nominee's name, Outcome 2.");
    const adminMail = await mailTo(admin.email);
    expect(adminMail.map((m) => m.subject)).toEqual([
      expect.stringMatching(/^Resubmitted for review/),
    ]);
  });

  it("lets a wrong-category return move to another enabled category", async () => {
    const { admin, nominator, entry: e, other, cycle } = await setup();
    await returnEntry(admin, e.id, RETURN);
    await expect(moveReturnedEntry(nominator, e.id, other.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await approveEntryAfterResubmit(admin, nominator, e.id);
    const second = await submitted(cycle.id, other.id, nominator);
    await returnEntry(admin, second.id, {
      reason: "WRONG_CATEGORY",
      message: "This reads as a strategist entry.",
    });
    const someoneElse = await createActor("NOMINATOR");
    await expect(moveReturnedEntry(someoneElse, second.id, e.categoryId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(moveReturnedEntry(nominator, second.id, second.categoryId)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await moveReturnedEntry(nominator, second.id, e.categoryId);
    await resubmitEntry(nominator, second.id);
    const [moved] = await db.select().from(entry).where(eq(entry.id, second.id));
    expect(moved).toMatchObject({ categoryId: e.categoryId, status: "SUBMITTED" });
    const [ev] = await db
      .select()
      .from(entryStatusEvent)
      .where(
        and(eq(entryStatusEvent.entryId, second.id), eq(entryStatusEvent.fromStatus, "RETURNED")),
      );
    expect(ev!.note).toBe("Changed: Category.");
  });

  it("closes triage when round one opens", async () => {
    const { admin, nominator, entry: e, cycle, category } = await setup();
    const returned = await submitted(cycle.id, category.id, nominator);
    await returnEntry(admin, returned.id, RETURN);
    await db.update(awardCycle).set({ phase: "ROUND1_OPEN" }).where(eq(awardCycle.id, cycle.id));
    await expect(approveEntry(admin, e.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(returnEntry(admin, e.id, RETURN)).rejects.toBeInstanceOf(ConflictError);
    await expect(resubmitEntry(nominator, returned.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

async function approveEntryAfterResubmit(admin: Actor, nominator: Actor, id: string) {
  await resubmitEntry(nominator, id);
  await approveEntry(admin, id);
}

describe("admin access", () => {
  it("is admin-only", async () => {
    const { nominator, entry: e } = await setup();
    const judge = await createActor("JUDGE");
    for (const who of [nominator, judge]) {
      await expect(approveEntry(who, e.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(returnEntry(who, e.id, RETURN)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getAdminEntry(who, e.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listTriageQueue(who, parseQueueFilters({}))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("hides reference contact details until asked, and audits each view", async () => {
    const { admin, entry: e } = await setup();
    const hidden = await getAdminEntry(admin, e.id);
    expect(hidden.references[0]).toMatchObject({ name: "Morgan Ellis", email: null, phone: null });
    expect(
      await db.select().from(auditLog).where(eq(auditLog.action, "entry.references_viewed")),
    ).toHaveLength(0);
    const shown = await getAdminEntry(admin, e.id, { showContacts: true, ip: "203.0.113.8" });
    expect(shown.references[0]).toMatchObject({ email: "morgan.ellis@example.org" });
    const [a] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "entry.references_viewed"));
    expect(a).toMatchObject({ actorId: admin.id, targetId: e.id, ip: "203.0.113.8" });
  });

  it("filters, sorts and pages the queue, never showing drafts", async () => {
    const { admin, nominator, cycle, category, other, entry: first } = await setup();
    for (let i = 0; i < 26; i++) await submitted(cycle.id, other.id, nominator);
    await createCompleteEntry({
      cycleId: cycle.id,
      categoryId: category.id,
      nominatorId: nominator.id,
    });
    await approveEntry(admin, first.id);
    const page1 = await listTriageQueue(admin, parseQueueFilters({ status: "SUBMITTED" }));
    expect(page1!.total).toBe(26);
    expect(page1!.rows).toHaveLength(25);
    const page2 = await listTriageQueue(
      admin,
      parseQueueFilters({ status: "SUBMITTED", page: "2" }),
    );
    expect(page2!.rows).toHaveLength(1);
    const approved = await listTriageQueue(admin, parseQueueFilters({ status: "APPROVED" }));
    expect(approved!.rows.map((r) => r.id)).toEqual([first.id]);
    const inCategory = await listTriageQueue(
      admin,
      parseQueueFilters({ status: "ALL", category: category.id }),
    );
    expect(inCategory!.total).toBe(1); // the draft in that category is not listed
    const bogus = parseQueueFilters({
      status: "DRAFT",
      sort: "sideways",
      page: "-4",
      category: "x",
    });
    expect(bogus).toEqual({ status: "SUBMITTED", sort: "oldest", page: 1, category: undefined });
  });
});
