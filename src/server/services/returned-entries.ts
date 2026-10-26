import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { category, entry, entryStatusEvent } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/** The latest return of an entry: reason and the team's message to the nominator. */
export async function latestReturn(entryId: string) {
  const [r] = await db
    .select({
      reason: entryStatusEvent.returnReason,
      message: entryStatusEvent.note,
      at: entryStatusEvent.createdAt,
    })
    .from(entryStatusEvent)
    .where(and(eq(entryStatusEvent.entryId, entryId), eq(entryStatusEvent.toStatus, "RETURNED")))
    .orderBy(desc(entryStatusEvent.createdAt))
    .limit(1);
  return r ?? null;
}

/**
 * Nominator: the entry's status history without who acted (admin identities stay
 * internal). Return messages are shown; internal approval notes are not.
 */
export async function getMyTimeline(actor: Actor, entryId: string) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const rows = await db
    .select({
      id: entryStatusEvent.id,
      fromStatus: entryStatusEvent.fromStatus,
      toStatus: entryStatusEvent.toStatus,
      returnReason: entryStatusEvent.returnReason,
      note: entryStatusEvent.note,
      at: entryStatusEvent.createdAt,
    })
    .from(entryStatusEvent)
    .innerJoin(entry, eq(entry.id, entryStatusEvent.entryId))
    .where(and(eq(entryStatusEvent.entryId, entryId), eq(entry.nominatorId, actor.id)))
    .orderBy(asc(entryStatusEvent.createdAt));
  return rows.map((r) => ({
    ...r,
    message: r.toStatus === "RETURNED" ? r.note : null,
    note: undefined,
  }));
}

/** Enabled categories a returned entry could move to (for a wrong-category return). */
export async function moveTargets(entryId: string) {
  const [e] = await db
    .select({ cycleId: entry.cycleId, categoryId: entry.categoryId })
    .from(entry)
    .where(eq(entry.id, entryId));
  if (!e) return [];
  return db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(
      and(
        eq(category.cycleId, e.cycleId),
        eq(category.enabled, true),
        ne(category.id, e.categoryId),
      ),
    )
    .orderBy(asc(category.sortOrder), asc(category.name));
}

/**
 * Nominator: moves an entry that was returned as "wrong category" to another enabled
 * category of its cycle. The paid fee carries over (every category costs the same).
 */
export async function moveReturnedEntry(actor: Actor, entryId: string, categoryId: string) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const fieldError = (m: string) => new ValidationError(m, { categoryId: [m] });
  if (!isUuid(categoryId)) throw fieldError("Choose a category");
  await db
    .transaction(async (tx) => {
      const [e] = await tx
        .select()
        .from(entry)
        .where(
          and(eq(entry.id, entryId), eq(entry.nominatorId, actor.id), eq(entry.status, "RETURNED")),
        )
        .for("update");
      if (!e) throw new NotFoundError("returned entry");
      const last = await latestReturn(entryId);
      if (last?.reason !== "WRONG_CATEGORY") {
        throw new ConflictError(
          "Only entries returned as in the wrong category can change category.",
        );
      }
      const [target] = await tx
        .select({ id: category.id })
        .from(category)
        .where(
          and(
            eq(category.id, categoryId),
            eq(category.cycleId, e.cycleId),
            eq(category.enabled, true),
          ),
        )
        .for("share");
      if (!target || target.id === e.categoryId) throw fieldError("Choose a different category");
      await tx.update(entry).set({ categoryId }).where(eq(entry.id, entryId));
    })
    .catch((err: { cause?: { code?: string; constraint?: string } }) => {
      if (
        err.cause?.code === "23505" &&
        err.cause.constraint === "entry_one_per_nominee_category"
      ) {
        throw fieldError("You already have an entry for this nominee in that category.");
      }
      throw err;
    });
}
