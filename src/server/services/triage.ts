import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { env } from "@/lib/env";
import { RETURN_REASON_LABEL } from "@/lib/entry-status";
import { isUuid } from "@/lib/ids";
import { readinessProblems, toSubmissionInput } from "@/lib/validation/entry";
import { approveEntrySchema, returnEntrySchema } from "@/lib/validation/triage";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db, type DbExecutor } from "@/server/db";
import {
  attachment,
  awardCycle,
  category,
  entry,
  entryOutcome,
  entryReference,
  entryStatusEvent,
  payment,
  user,
} from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import {
  entryApprovedEmail,
  entryResubmittedEmail,
  entryReturnedEmail,
} from "@/server/email/templates";
import { CATEGORY_NAME_KEY, changedFields, contentHashes } from "@/server/entry-changes";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";

export const TRIAGE_CLOSED_MESSAGE =
  "Eligibility review has closed because round one judging has opened.";

/**
 * Locks the cycle FOR SHARE (serializes with an admin opening round one, #12), checks
 * triage is open on the locked row, then locks the entry FOR UPDATE: cycle before
 * entry, the same order as the other cycle-level locks. `ownerId` scopes the entry to
 * its nominator, so nobody can lock (or probe) someone else's entry.
 */
async function lockForTriage(tx: DbExecutor, entryId: string, ownerId?: string) {
  const owned = (id: string) =>
    ownerId ? and(eq(entry.id, id), eq(entry.nominatorId, ownerId)) : eq(entry.id, id);
  const [ref] = await tx.select({ cycleId: entry.cycleId }).from(entry).where(owned(entryId));
  if (!ref) throw new NotFoundError("entry");
  const [cycle] = await tx
    .select({ phase: awardCycle.phase })
    .from(awardCycle)
    .where(eq(awardCycle.id, ref.cycleId))
    .for("share");
  if (cycle?.phase !== "NOMINATION") throw new ConflictError(TRIAGE_CLOSED_MESSAGE);
  const [locked] = await tx.select().from(entry).where(owned(entryId)).for("update");
  if (!locked) throw new NotFoundError("entry");
  return locked;
}

/**
 * Refuses when the entry changed (a newer status event) after the admin's page was
 * rendered, so nobody approves or returns content they have not seen.
 */
async function assertCurrent(tx: DbExecutor, entryId: string, version: string | undefined) {
  if (!version) return;
  const [latest] = await tx
    .select({ id: entryStatusEvent.id })
    .from(entryStatusEvent)
    .where(eq(entryStatusEvent.entryId, entryId))
    .orderBy(desc(entryStatusEvent.createdAt))
    .limit(1);
  if (latest && latest.id !== version) {
    throw new ConflictError(
      "This entry changed after you opened it. Reload the page and review it again.",
    );
  }
}

export async function loadContent(tx: DbExecutor, e: typeof entry.$inferSelect) {
  const [outcomes, references, files] = await Promise.all([
    tx
      .select()
      .from(entryOutcome)
      .where(eq(entryOutcome.entryId, e.id))
      .orderBy(asc(entryOutcome.position)),
    tx
      .select()
      .from(entryReference)
      .where(eq(entryReference.entryId, e.id))
      .orderBy(asc(entryReference.position)),
    tx.select({ sha256: attachment.sha256 }).from(attachment).where(eq(attachment.entryId, e.id)),
  ]);
  return { ...e, outcomes, references, fileHashes: files.map((f) => f.sha256) };
}

/** Admin: SUBMITTED → APPROVED (eligible for judging). Emails the nominator. */
export async function approveEntry(
  actor: Actor,
  entryId: string,
  raw: Record<string, unknown> = {},
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const parsed = approveEntrySchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Check the note.", fieldErrorsOf(parsed.error));
  const eventId = await db.transaction(async (tx) => {
    const e = await lockForTriage(tx, entryId);
    if (e.status !== "SUBMITTED")
      throw new ConflictError("Only submitted entries can be approved.");
    await assertCurrent(tx, entryId, parsed.data.version);
    await tx.update(entry).set({ status: "APPROVED" }).where(eq(entry.id, entryId));
    const [ev] = await tx
      .insert(entryStatusEvent)
      .values({
        entryId,
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
        actorId: actor.id,
        note: parsed.data.note || null,
      })
      .returning({ id: entryStatusEvent.id });
    await audit(
      { actor, action: "entry.approved", targetType: "entry", targetId: entryId, ip },
      tx,
    );
    return ev!.id;
  });
  await notifyNominator(entryId, eventId, (i) => entryApprovedEmail(i));
}

/** Admin: SUBMITTED → RETURNED with a reason and a message to the nominator. */
export async function returnEntry(
  actor: Actor,
  entryId: string,
  raw: Record<string, unknown>,
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const parsed = returnEntrySchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  const { reason, message } = parsed.data;
  const eventId = await db.transaction(async (tx) => {
    const e = await lockForTriage(tx, entryId);
    if (e.status !== "SUBMITTED")
      throw new ConflictError("Only submitted entries can be returned.");
    await assertCurrent(tx, entryId, parsed.data.version);
    await tx.update(entry).set({ status: "RETURNED" }).where(eq(entry.id, entryId));
    const [ev] = await tx
      .insert(entryStatusEvent)
      .values({
        entryId,
        fromStatus: "SUBMITTED",
        toStatus: "RETURNED",
        actorId: actor.id,
        returnReason: reason,
        note: message,
        contentHashes: {
          ...contentHashes(await loadContent(tx, e)),
          // Category names are not confidential: lets the summary say "was …".
          [CATEGORY_NAME_KEY]: await categoryName(tx, e.categoryId),
        },
      })
      .returning({ id: entryStatusEvent.id });
    await audit(
      {
        actor,
        action: "entry.returned",
        targetType: "entry",
        targetId: entryId,
        metadata: { reason },
        ip,
      },
      tx,
    );
    return ev!.id;
  });
  await notifyNominator(entryId, eventId, (i) =>
    entryReturnedEmail({ ...i, reasonLabel: RETURN_REASON_LABEL[reason], message }),
  );
}

/**
 * Nominator: RETURNED → SUBMITTED, no new fee. Requires the entry to be complete, its
 * category offered and triage open. Tells the program team what changed.
 */
export async function resubmitEntry(actor: Actor, entryId: string) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const result = await db.transaction(async (tx) => {
    const e = await lockForTriage(tx, entryId, actor.id).catch((err: unknown) => {
      throw err instanceof ConflictError
        ? new ConflictError(
            "Judging has started, so returned entries can no longer be resubmitted.",
          )
        : err;
    });
    if (e.status !== "RETURNED")
      throw new ConflictError("Only returned entries can be resubmitted.");
    const [cat] = await tx
      .select({ name: category.name, enabled: category.enabled })
      .from(category)
      .where(eq(category.id, e.categoryId))
      .for("share");
    if (!cat?.enabled)
      throw new ConflictError("This category is no longer offered. Contact the program team.");
    const [paid] = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          eq(payment.entryId, entryId),
          eq(payment.kind, "ENTRY_FEE"),
          eq(payment.status, "PAID"),
        ),
      )
      .limit(1);
    if (!paid)
      throw new ConflictError("This entry has no paid entry fee. Contact the program team.");
    const content = await loadContent(tx, e);
    const problems = readinessProblems(toSubmissionInput(content));
    if (Object.keys(problems).length > 0)
      throw new ValidationError("Complete the entry before resubmitting.", problems);

    const [lastReturn] = await tx
      .select({ hashes: entryStatusEvent.contentHashes })
      .from(entryStatusEvent)
      .where(and(eq(entryStatusEvent.entryId, entryId), eq(entryStatusEvent.toStatus, "RETURNED")))
      .orderBy(desc(entryStatusEvent.createdAt))
      .limit(1);
    const changes = lastReturn?.hashes
      ? changedFields(lastReturn.hashes, contentHashes(content))
      : null;
    const note =
      changes === null
        ? "Changes since the return were not recorded."
        : changes.length
          ? `Changed: ${changes.join(", ")}.`
          : "No changes since the return.";
    await tx.update(entry).set({ status: "SUBMITTED" }).where(eq(entry.id, entryId));
    await tx
      .insert(entryStatusEvent)
      .values({ entryId, fromStatus: "RETURNED", toStatus: "SUBMITTED", actorId: actor.id, note });
    return { categoryName: cat.name, nomineeName: e.nomineeName ?? "Unnamed nominee", note };
  });
  const to = await adminInbox();
  const { APP_URL } = env();
  await Promise.all(
    to.map((address) =>
      safeSend({
        to: address,
        template: "entry_resubmitted",
        content: entryResubmittedEmail({
          ...result,
          changes: result.note,
          adminUrl: `${APP_URL}/admin/entries/${entryId}`,
        }),
      }),
    ),
  );
}

/** ADMIN_NOTIFY_EMAIL, else every active admin account. */
async function adminInbox(): Promise<string[]> {
  const configured = env().ADMIN_NOTIFY_EMAIL;
  if (configured) return [configured];
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(and(eq(user.role, "ADMIN"), isNull(user.disabledAt)));
  return rows.map((r) => r.email);
}

async function notifyNominator(
  entryId: string,
  eventId: string,
  content: (i: {
    categoryName: string;
    nomineeName: string;
    entryUrl: string;
  }) => Parameters<typeof sendEmail>[0]["content"],
) {
  const [i] = await db
    .select({ email: user.email, categoryName: category.name, nomineeName: entry.nomineeName })
    .from(entry)
    .innerJoin(user, eq(user.id, entry.nominatorId))
    .innerJoin(category, eq(category.id, entry.categoryId))
    .where(eq(entry.id, entryId));
  if (!i) return;
  await safeSend({
    to: i.email,
    template: "entry_status",
    dedupeKey: `status:${eventId}`,
    content: content({
      categoryName: i.categoryName,
      nomineeName: i.nomineeName ?? "your nominee",
      entryUrl: `${env().APP_URL}/entries/${entryId}`,
    }),
  });
}

/** The status change is committed; a mail failure is logged, never shown as a failed action. */
async function safeSend(msg: Parameters<typeof sendEmail>[0]) {
  await sendEmail(msg).catch((err: unknown) => {
    const e = err as { name?: string; code?: string };
    console.error("Status email failed:", e?.name ?? typeof err, e?.code ?? "");
  });
}

async function categoryName(tx: DbExecutor, id: string) {
  const [c] = await tx.select({ name: category.name }).from(category).where(eq(category.id, id));
  return c?.name ?? "";
}
