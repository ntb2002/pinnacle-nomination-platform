import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { draftSchema, type EntryDraft } from "@/lib/validation/entry";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db, type Transaction } from "@/server/db";
import { attachment, entry, entryOutcome, entryReference, payment } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";
import { removeBytes } from "./attachments";
import { assertNoOpenCheckout } from "./checkout";
import { EDITABLE_STATUSES } from "./entries";

const blankToNull = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

/**
 * Nominator: saves a draft (or a returned entry being corrected). Any subset of fields
 * may be filled; lengths are capped, formats are checked at review. Outcomes and
 * references are replaced as a set. Only the entry's own nominator, and only while
 * the entry is editable.
 */
export async function saveDraft(actor: Actor, entryId: string, raw: unknown) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new NotFoundError("editable entry");
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  }
  const d = parsed.data;
  await db
    .transaction(async (tx) => {
      const [current] = await tx
        .select({ id: entry.id, relationship: entry.relationship })
        .from(entry)
        .where(
          and(
            eq(entry.id, entryId),
            eq(entry.nominatorId, actor.id),
            inArray(entry.status, [...EDITABLE_STATUSES]),
          ),
        )
        .for("update");
      if (!current) throw new NotFoundError("editable entry");
      await assertNoOpenCheckout(tx, entryId);

      await tx
        .update(entry)
        .set({
          nomineeName: blankToNull(d.nomineeName),
          nomineeTitle: blankToNull(d.nomineeTitle),
          nomineeCompany: blankToNull(d.nomineeCompany),
          // A self-nomination's nominee is the signed-in nominator.
          nomineeEmail:
            current.relationship === "SELF"
              ? actor.email
              : (blankToNull(d.nomineeEmail)?.toLowerCase() ?? null),
          nomineeLinkedinUrl: blankToNull(d.nomineeLinkedinUrl),
          narrative: d.narrative && d.narrative.trim() !== "" ? d.narrative : null,
        })
        .where(eq(entry.id, entryId));

      await syncOutcomes(tx, entryId, d.outcomes);
      await syncReferences(tx, entryId, d.references);
    })
    .catch((err: unknown) => {
      const cause = (err as { cause?: { code?: string; constraint?: string } }).cause;
      if (cause?.code === "23505" && cause.constraint === "entry_one_per_nominee_category") {
        throw new ValidationError("Check the highlighted fields.", {
          nomineeEmail: [
            "You already have an entry for this nominee in this category. Edit that entry instead.",
          ],
        });
      }
      throw err;
    });
}

/**
 * Makes an entry's numbered rows match the draft: updates rows in place by position so
 * their ids stay stable, inserts new positions, deletes positions beyond the new count.
 */
async function syncOutcomes(tx: Transaction, entryId: string, rows: EntryDraft["outcomes"]) {
  await tx
    .delete(entryOutcome)
    .where(and(eq(entryOutcome.entryId, entryId), gt(entryOutcome.position, rows.length)));
  for (const [i, row] of rows.entries()) {
    await tx
      .insert(entryOutcome)
      .values({ entryId, position: i + 1, ...row })
      .onConflictDoUpdate({ target: [entryOutcome.entryId, entryOutcome.position], set: row });
  }
}

async function syncReferences(tx: Transaction, entryId: string, rows: EntryDraft["references"]) {
  await tx
    .delete(entryReference)
    .where(and(eq(entryReference.entryId, entryId), gt(entryReference.position, rows.length)));
  for (const [i, row] of rows.entries()) {
    await tx
      .insert(entryReference)
      .values({ entryId, position: i + 1, ...row })
      .onConflictDoUpdate({ target: [entryReference.entryId, entryReference.position], set: row });
  }
}

/**
 * Nominator: deletes one of their own drafts that has never had a checkout started.
 * Its outcomes and references go with it (cascade). Anything submitted or paid stays.
 */
export async function deleteDraft(actor: Actor, entryId: string) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new NotFoundError("draft");
  const keys = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: entry.id })
      .from(entry)
      .where(and(eq(entry.id, entryId), eq(entry.nominatorId, actor.id), eq(entry.status, "DRAFT")))
      .for("update");
    if (!row) throw new NotFoundError("draft");
    const [paid] = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(eq(payment.entryId, entryId))
      .limit(1);
    if (paid)
      throw new ConflictError(
        "This draft has a payment attempt, so it cannot be deleted. Contact the program team.",
      );
    const files = await tx
      .select({ key: attachment.storageKey })
      .from(attachment)
      .where(eq(attachment.entryId, entryId));
    await tx.delete(entry).where(eq(entry.id, entryId));
    return files.map((f) => f.key);
  });
  // The rows went with the entry; now the stored bytes (best effort).
  await removeBytes(keys);
}
