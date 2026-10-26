import "server-only";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { checkSelection } from "@/lib/scoring";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db, type DbExecutor } from "@/server/db";
import { awardCycle, category, entry, finalistSelection, payment } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { CONFIRMATION_GRACE_MS } from "./checkout";
import { computeRanking } from "./rankings";

/** Locks the active cycle FOR UPDATE: every phase change and selection takes it first. */
export async function lockCycle(tx: DbExecutor) {
  const [cycle] = await tx
    .select()
    .from(awardCycle)
    .where(eq(awardCycle.isActive, true))
    .for("update");
  if (!cycle) throw new NotFoundError("active cycle");
  return cycle;
}

/** Entries still in eligibility review: they will not be judged once round one opens. */
async function pendingReview(tx: DbExecutor, cycleId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(entry)
    .where(and(eq(entry.cycleId, cycleId), inArray(entry.status, ["SUBMITTED", "RETURNED"])));
  return row?.n ?? 0;
}

/** Entry-fee checkouts that can still be paid or are still being confirmed. */
async function openCheckouts(tx: DbExecutor, cycleId: string, now: Date) {
  const [row] = await tx
    .select({ n: count() })
    .from(payment)
    .innerJoin(entry, eq(entry.id, payment.entryId))
    .where(
      and(
        eq(entry.cycleId, cycleId),
        eq(payment.kind, "ENTRY_FEE"),
        eq(payment.status, "PENDING"),
        gt(payment.expiresAt, new Date(now.getTime() - CONFIRMATION_GRACE_MS)),
      ),
    );
  return row?.n ?? 0;
}

/** Categories with entries that have fewer than 2 counted scores (closing would strand them). */
async function categoriesWithBlockers(tx: DbExecutor, cycleId: string) {
  const cats = await tx
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(eq(category.cycleId, cycleId))
    .orderBy(category.sortOrder);
  const out: { name: string; blockers: number }[] = [];
  for (const c of cats) {
    const r = await computeRanking(tx, c.id, 1);
    if (r.blockers.length) out.push({ name: c.name, blockers: r.blockers.length });
  }
  return out;
}

/** Admin: the state of round one across categories, for the judging page. */
export async function getRoundOneOverview(actor: Actor, now = new Date()) {
  assertRole(actor, "ADMIN");
  const [cycle] = await db.select().from(awardCycle).where(eq(awardCycle.isActive, true));
  if (!cycle) return null;
  const cats = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(and(eq(category.cycleId, cycle.id), eq(category.enabled, true)))
    .orderBy(category.sortOrder);
  const selections = await db
    .select()
    .from(finalistSelection)
    .where(eq(finalistSelection.cycleId, cycle.id));
  const categories = [];
  for (const c of cats) {
    const r = await computeRanking(db, c.id, 1);
    const selection = selections.find((s) => s.categoryId === c.id) ?? null;
    categories.push({
      id: c.id,
      name: c.name,
      entries: r.ranked.length,
      blockers: r.blockers.length,
      selection,
      // A selection the scores no longer support (e.g. a late conflict) must be redone.
      selectionStale:
        !!selection &&
        !checkSelection(
          r.ranked,
          selection.entryIds.length,
          selection.entryIds,
          selection.tiebreakReason ?? "",
        ).ok,
    });
  }
  return {
    phase: cycle.phase,
    nominationsClosed: now >= cycle.finalDeadline,
    pendingReview: await pendingReview(db, cycle.id),
    categories,
  };
}

/**
 * Admin: NOMINATION → ROUND1_OPEN. Needs nominations closed and no entry-fee checkout
 * still payable (a late payment would submit an entry after triage ended); locks
 * rubric weights and ends triage. Entries still in review are left out, so the admin
 * confirms that.
 */
export async function openRoundOne(
  actor: Actor,
  raw: { confirm?: boolean },
  ip?: string,
  now = new Date(),
) {
  assertRole(actor, "ADMIN");
  await db.transaction(async (tx) => {
    const cycle = await lockCycle(tx);
    if (cycle.phase !== "NOMINATION") throw new ConflictError("Round one has already opened.");
    if (now < cycle.finalDeadline)
      throw new ConflictError(
        "Nominations are still open. Round one opens after the final deadline.",
      );
    const checkouts = await openCheckouts(tx, cycle.id, now);
    if (checkouts > 0)
      throw new ConflictError(
        `${checkouts} entry-fee ${checkouts === 1 ? "checkout is" : "checkouts are"} still open or being confirmed. Round one can open once they are paid or expire.`,
      );
    const pending = await pendingReview(tx, cycle.id);
    if (pending > 0 && !raw.confirm) {
      throw new ValidationError("Confirm the entries still in review.", {
        confirm: [
          `${pending} ${pending === 1 ? "entry is" : "entries are"} still in eligibility review and will not be judged. Tick to confirm.`,
        ],
      });
    }
    await tx.update(awardCycle).set({ phase: "ROUND1_OPEN" }).where(eq(awardCycle.id, cycle.id));
    await audit(
      {
        actor,
        action: "round.opened",
        targetType: "award_cycle",
        targetId: cycle.id,
        metadata: { round: 1, pendingReview: pending },
        ip,
      },
      tx,
    );
  });
}

/**
 * Admin: ROUND1_OPEN → ROUND1_CLOSED. Scores are final from here, so closing is refused
 * while any entry has fewer than 2 counted scores: assign another judge first.
 */
export async function closeRoundOne(actor: Actor, ip?: string) {
  assertRole(actor, "ADMIN");
  await db.transaction(async (tx) => {
    const cycle = await lockCycle(tx);
    if (cycle.phase !== "ROUND1_OPEN") throw new ConflictError("Round one is not open.");
    const short = await categoriesWithBlockers(tx, cycle.id);
    if (short.length)
      throw new ConflictError(
        `Some entries have fewer than 2 scores: ${short.map((c) => `${c.name} (${c.blockers})`).join(", ")}. Assign another judge or wait for scores before closing.`,
      );
    await tx.update(awardCycle).set({ phase: "ROUND1_CLOSED" }).where(eq(awardCycle.id, cycle.id));
    await audit(
      {
        actor,
        action: "round.closed",
        targetType: "award_cycle",
        targetId: cycle.id,
        metadata: { round: 1 },
        ip,
      },
      tx,
    );
  });
}

/**
 * Admin: ROUND1_CLOSED → ROUND1_OPEN, before finalists are announced: the one way back,
 * for when a late conflict leaves an entry short of scores. Clears the saved finalist
 * selections (they are re-made after the round closes again). Needs a reason; audited.
 */
export async function reopenRoundOne(actor: Actor, raw: { reason: string }, ip?: string) {
  assertRole(actor, "ADMIN");
  const reason = raw.reason.trim();
  if (reason.length < 10 || reason.length > 500)
    throw new ValidationError("Give a reason.", {
      reason: ["Give a reason of 10 to 500 characters"],
    });
  await db.transaction(async (tx) => {
    const cycle = await lockCycle(tx);
    if (cycle.phase !== "ROUND1_CLOSED")
      throw new ConflictError(
        "Round one can be reopened only after it closes and before finalists are announced.",
      );
    const cleared = await tx
      .delete(finalistSelection)
      .where(eq(finalistSelection.cycleId, cycle.id))
      .returning({ id: finalistSelection.id });
    await tx.update(awardCycle).set({ phase: "ROUND1_OPEN" }).where(eq(awardCycle.id, cycle.id));
    await audit(
      {
        actor,
        action: "round.reopened",
        targetType: "award_cycle",
        targetId: cycle.id,
        metadata: { round: 1, reason, selectionsCleared: cleared.length },
        ip,
      },
      tx,
    );
  });
}
