import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { entryFeeFor } from "@/lib/pricing";
import { startEntrySchema } from "@/lib/validation/entry";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db, type DbExecutor } from "@/server/db";
import {
  awardCycle,
  category,
  entry,
  entryOutcome,
  entryReference,
  entryStatusEvent,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";

export const EDITABLE_STATUSES = ["DRAFT", "RETURNED"] as const;

export const RETURNED_CLOSED_MESSAGE =
  "Judging has started, so returned entries can no longer be changed or resubmitted.";

/**
 * A returned entry can only change while triage is open (the cycle in NOMINATION):
 * after round one opens it can no longer be resubmitted, so edits would be pointless
 * and could confuse a later review. Call inside the transaction that locks the entry.
 */
export async function assertReturnedStillOpen(
  tx: DbExecutor,
  e: { status: string; cycleId: string },
) {
  if (e.status !== "RETURNED") return;
  const [cycle] = await tx
    .select({ phase: awardCycle.phase })
    .from(awardCycle)
    .where(eq(awardCycle.id, e.cycleId));
  if (cycle?.phase !== "NOMINATION") throw new ConflictError(RETURNED_CLOSED_MESSAGE);
}

async function activeCycle() {
  const [cycle] = await db.select().from(awardCycle).where(eq(awardCycle.isActive, true));
  if (!cycle) throw new NotFoundError("active cycle");
  return cycle;
}

/**
 * Nominator: starts a draft entry in an enabled category of the active cycle, while
 * nominations are open. Judges and admins cannot nominate (conflict policy). A
 * self-nomination is prefilled with the nominator's own name and email.
 */
export async function startEntry(actor: Actor, raw: Record<string, unknown>, now = new Date()) {
  assertRole(actor, "NOMINATOR");
  const parsed = startEntrySchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  const cycle = await activeCycle();
  const nominationWindow = entryFeeFor(cycle, now);
  if (!nominationWindow.open) {
    throw new ConflictError(
      nominationWindow.reason === "NOT_OPEN"
        ? "Nominations are not open yet."
        : "Nominations have closed.",
    );
  }
  const [cat] = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.id, parsed.data.categoryId),
        eq(category.cycleId, cycle.id),
        eq(category.enabled, true),
      ),
    );
  if (!cat) throw new ValidationError("Choose a category.", { categoryId: ["Choose a category"] });

  const self = parsed.data.relationship === "SELF";
  const [created] = await db
    .insert(entry)
    .values({
      cycleId: cycle.id,
      categoryId: cat.id,
      nominatorId: actor.id,
      relationship: parsed.data.relationship,
      nomineeName: self ? actor.name || null : null,
      nomineeEmail: self ? actor.email : null,
    })
    .returning({ id: entry.id })
    .catch((err: { cause?: { code?: string; constraint?: string } }) => {
      if (
        err.cause?.code === "23505" &&
        err.cause.constraint === "entry_one_per_nominee_category"
      ) {
        throw new ConflictError("You already have an entry for yourself in this category.");
      }
      throw err;
    });
  return created!.id;
}

/** The nominator's own entries, newest first, with category names. */
export async function listMyEntries(actor: Actor) {
  assertRole(actor, "NOMINATOR");
  return db
    .select({
      id: entry.id,
      status: entry.status,
      nomineeName: entry.nomineeName,
      nomineeCompany: entry.nomineeCompany,
      categoryName: category.name,
      updatedAt: entry.updatedAt,
      submittedAt: entry.submittedAt,
      triageOpen: sql<boolean>`${awardCycle.phase} = 'NOMINATION'`,
      // The program team's message from the latest return, shown while it is returned.
      returnMessage: sql<string | null>`(
        select ${entryStatusEvent.note} from ${entryStatusEvent}
        where ${entryStatusEvent.entryId} = ${entry.id} and ${entryStatusEvent.toStatus} = 'RETURNED'
        order by ${entryStatusEvent.createdAt} desc limit 1)`,
    })
    .from(entry)
    .innerJoin(category, eq(category.id, entry.categoryId))
    .innerJoin(awardCycle, eq(awardCycle.id, entry.cycleId))
    .where(eq(entry.nominatorId, actor.id))
    .orderBy(desc(entry.updatedAt));
}

/** One of the nominator's own entries with outcomes and references. NotFound for anyone else's. */
export async function getMyEntry(actor: Actor, entryId: string) {
  assertRole(actor, "NOMINATOR");
  if (!isUuid(entryId)) throw new NotFoundError("entry");
  const [row] = await db
    .select({
      entry,
      categoryName: category.name,
      categoryEnabled: category.enabled,
      cyclePhase: awardCycle.phase,
    })
    .from(entry)
    .innerJoin(category, eq(category.id, entry.categoryId))
    .innerJoin(awardCycle, eq(awardCycle.id, entry.cycleId))
    .where(and(eq(entry.id, entryId), eq(entry.nominatorId, actor.id)));
  if (!row) throw new NotFoundError("entry");
  const [outcomes, references] = await Promise.all([
    db
      .select()
      .from(entryOutcome)
      .where(eq(entryOutcome.entryId, entryId))
      .orderBy(asc(entryOutcome.position)),
    db
      .select()
      .from(entryReference)
      .where(eq(entryReference.entryId, entryId))
      .orderBy(asc(entryReference.position)),
  ]);
  return {
    ...row.entry,
    categoryName: row.categoryName,
    categoryEnabled: row.categoryEnabled,
    /** False once round one opens: returned entries are then frozen. */
    triageOpen: row.cyclePhase === "NOMINATION",
    outcomes,
    references,
  };
}

/** What the start-a-nomination page offers: open/closed, the fee now, enabled categories. */
export async function getNominationOptions(now = new Date()) {
  const cycle = await activeCycle();
  const fee = entryFeeFor(cycle, now);
  const categories = await db
    .select({
      id: category.id,
      name: category.name,
      description: category.description,
      kind: category.kind,
    })
    .from(category)
    .where(and(eq(category.cycleId, cycle.id), eq(category.enabled, true)))
    .orderBy(asc(category.sortOrder), asc(category.name));
  return {
    cycle: { name: cycle.name, nominationsOpenAt: cycle.nominationsOpenAt },
    fee,
    categories,
  };
}

/** The nomination window for dashboards: null when no cycle is active (pages still render). */
export async function getNominationWindow(now = new Date()) {
  const [cycle] = await db.select().from(awardCycle).where(eq(awardCycle.isActive, true));
  return cycle ? entryFeeFor(cycle, now) : null;
}
