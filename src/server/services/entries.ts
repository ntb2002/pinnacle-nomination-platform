import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { entryFeeFor } from "@/lib/pricing";
import { startEntrySchema } from "@/lib/validation/entry";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { awardCycle, category, entry, entryOutcome, entryReference } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";

export const EDITABLE_STATUSES = ["DRAFT", "RETURNED"] as const;

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
    .catch((err: { cause?: { code?: string } }) => {
      if (err.cause?.code === "23505") {
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
    })
    .from(entry)
    .innerJoin(category, eq(category.id, entry.categoryId))
    .where(eq(entry.nominatorId, actor.id))
    .orderBy(desc(entry.updatedAt));
}

/** One of the nominator's own entries with outcomes and references. NotFound for anyone else's. */
export async function getMyEntry(actor: Actor, entryId: string) {
  assertRole(actor, "NOMINATOR");
  const [row] = await db
    .select({ entry, categoryName: category.name, categoryEnabled: category.enabled })
    .from(entry)
    .innerJoin(category, eq(category.id, entry.categoryId))
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
  return { ...row.entry, categoryName: row.categoryName, outcomes, references };
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
