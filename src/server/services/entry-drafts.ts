import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { draftSchema } from "@/lib/validation/entry";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { entry, entryOutcome, entryReference } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";
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
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  }
  const d = parsed.data;
  await db
    .transaction(async (tx) => {
      const [current] = await tx
        .select({ id: entry.id })
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

      await tx
        .update(entry)
        .set({
          nomineeName: blankToNull(d.nomineeName),
          nomineeTitle: blankToNull(d.nomineeTitle),
          nomineeCompany: blankToNull(d.nomineeCompany),
          nomineeEmail: blankToNull(d.nomineeEmail)?.toLowerCase() ?? null,
          nomineeLinkedinUrl: blankToNull(d.nomineeLinkedinUrl),
          narrative: d.narrative && d.narrative.trim() !== "" ? d.narrative : null,
        })
        .where(eq(entry.id, entryId));

      await tx.delete(entryOutcome).where(eq(entryOutcome.entryId, entryId));
      if (d.outcomes.length) {
        await tx
          .insert(entryOutcome)
          .values(d.outcomes.map((o, i) => ({ entryId, position: i + 1, ...o })));
      }
      await tx.delete(entryReference).where(eq(entryReference.entryId, entryId));
      if (d.references.length) {
        await tx
          .insert(entryReference)
          .values(d.references.map((r, i) => ({ entryId, position: i + 1, ...r })));
      }
    })
    .catch((err: unknown) => {
      const code = (err as { cause?: { code?: string; constraint?: string } }).cause;
      if (code?.code === "23505" && code.constraint === "entry_one_per_nominee_category") {
        throw new ValidationError("Check the highlighted fields.", {
          nomineeEmail: [
            "You already have an entry for this nominee in this category. Edit that entry instead.",
          ],
        });
      }
      throw err;
    });
}
