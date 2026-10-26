import "server-only";
import { and, eq } from "drizzle-orm";
import { roundOpen, type Round } from "@/lib/phases";
import { scoreSchema } from "@/lib/validation/scores";
import { audit } from "@/server/audit";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { awardCycle, category, entry, rubricProfile, score } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation";
import { judgeAccess } from "./entry-access";

/** The category's rubric weights and whether this round is open for scoring. */
async function scoringContext(entryId: string, round: Round) {
  const [row] = await db
    .select({
      phase: awardCycle.phase,
      weightImpact: rubricProfile.weightImpact,
      weightInnovation: rubricProfile.weightInnovation,
      weightInfluence: rubricProfile.weightInfluence,
      weightReferences: rubricProfile.weightReferences,
    })
    .from(entry)
    .innerJoin(awardCycle, eq(awardCycle.id, entry.cycleId))
    .innerJoin(category, eq(category.id, entry.categoryId))
    .innerJoin(rubricProfile, eq(rubricProfile.id, category.rubricProfileId))
    .where(eq(entry.id, entryId));
  if (!row) throw new NotFoundError("entry");
  const { phase, ...weights } = row;
  return { open: roundOpen(phase, round), weights };
}

/** Judge: their own score for an entry in a round (never anyone else's), plus the weights. */
export async function getMyScore(actor: Actor, entryId: string, round: Round) {
  assertRole(actor, "JUDGE");
  const access = await judgeAccess(actor.id, entryId);
  if (!access?.readableRounds.includes(round)) throw new NotFoundError("entry");
  const ctx = await scoringContext(entryId, round);
  const [mine] = await db
    .select()
    .from(score)
    .where(and(eq(score.judgeId, actor.id), eq(score.entryId, entryId), eq(score.round, round)));
  return { ...ctx, score: mine ?? null };
}

/**
 * Judge: saves a draft or submits a score. Only while the round is open, only for an
 * entry the judge may read in that round (assigned, active, declared no conflict).
 * A submitted score can be revised until the round closes. Submissions are audited.
 */
export async function saveScore(
  actor: Actor,
  entryId: string,
  round: Round,
  raw: Record<string, unknown>,
  ip?: string,
) {
  assertRole(actor, "JUDGE");
  if (round !== 1 && round !== 2) throw new NotFoundError("entry");
  const parsed = scoreSchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError("Check the highlighted scores.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  await db.transaction(async (tx) => {
    // Lock the entry first: serializes with a judge's own late conflict declaration.
    await tx.select({ id: entry.id }).from(entry).where(eq(entry.id, entryId)).for("no key update");
    const access = await judgeAccess(actor.id, entryId, tx);
    if (!access?.readableRounds.includes(round)) throw new NotFoundError("entry");
    const [cycle] = await tx
      .select({ phase: awardCycle.phase })
      .from(entry)
      .innerJoin(awardCycle, eq(awardCycle.id, entry.cycleId))
      .where(eq(entry.id, entryId))
      .for("share", { of: awardCycle });
    if (!cycle || !roundOpen(cycle.phase, round))
      throw new ConflictError(`Round ${round} is not open for scoring.`);
    const values = {
      impact: v.impact,
      innovation: v.innovation,
      influence: v.influence,
      referenceValidation: v.referenceValidation,
      comment: v.comment || null,
    };
    const [existing] = await tx
      .select({ id: score.id, submittedAt: score.submittedAt })
      .from(score)
      .where(and(eq(score.judgeId, actor.id), eq(score.entryId, entryId), eq(score.round, round)));
    // Saving a draft over a submitted score withdraws it until resubmitted.
    const submittedAt = v.intent === "submit" ? new Date() : null;
    if (existing)
      await tx
        .update(score)
        .set({ ...values, submittedAt })
        .where(eq(score.id, existing.id));
    else
      await tx.insert(score).values({ judgeId: actor.id, entryId, round, ...values, submittedAt });
    if (v.intent === "submit") {
      await audit(
        {
          actor,
          action: existing?.submittedAt ? "score.revised" : "score.submitted",
          targetType: "entry",
          targetId: entryId,
          metadata: {
            round,
            impact: v.impact,
            innovation: v.innovation,
            influence: v.influence,
            referenceValidation: v.referenceValidation,
          },
          ip,
        },
        tx,
      );
    } else if (existing?.submittedAt) {
      await audit(
        {
          actor,
          action: "score.withdrawn",
          targetType: "entry",
          targetId: entryId,
          metadata: { round },
          ip,
        },
        tx,
      );
    }
  });
}
