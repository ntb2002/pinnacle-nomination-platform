import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import type { Round } from "@/lib/phases";
import { checkSelection, entryScore, rank, type Ranked, type Weights } from "@/lib/scoring";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db, type DbExecutor } from "@/server/db";
import {
  awardCycle,
  category,
  conflictDeclaration,
  entry,
  finalistSelection,
  judgeAssignment,
  judgeProfile,
  rubricProfile,
  score,
  user,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";

/** Fewer submitted, unrecused scores than this blocks announcing finalists (#12 AC 9). */
export const MIN_SCORES = 2;

/**
 * A category's ranking for a round, for admins only: each entry's mean of submitted,
 * unrecused judges' weighted scores, how many counted, the spread, and which eligible
 * judges have not submitted. Round 1 ranks approved entries; round 2 finalists.
 */
export async function computeRanking(tx: DbExecutor, categoryId: string, round: Round) {
  const [cat] = await tx
    .select({
      name: category.name,
      cycleId: category.cycleId,
      weightImpact: rubricProfile.weightImpact,
      weightInnovation: rubricProfile.weightInnovation,
      weightInfluence: rubricProfile.weightInfluence,
      weightReferences: rubricProfile.weightReferences,
    })
    .from(category)
    .innerJoin(rubricProfile, eq(rubricProfile.id, category.rubricProfileId))
    .where(eq(category.id, categoryId));
  if (!cat) throw new NotFoundError("category");
  const { name, cycleId, ...weights } = cat;
  const entries = await tx
    .select({ id: entry.id, nomineeName: entry.nomineeName, nomineeCompany: entry.nomineeCompany })
    .from(entry)
    .where(
      and(
        eq(entry.categoryId, categoryId),
        eq(entry.status, "APPROVED"),
        ...(round === 2 ? [eq(entry.isFinalist, true)] : []),
      ),
    );
  const ids = entries.map((e) => e.id);
  const scores = ids.length
    ? await tx
        .select()
        .from(score)
        .where(and(inArray(score.entryId, ids), eq(score.round, round)))
    : [];
  const conflicts = ids.length
    ? await tx
        .select({ judgeId: conflictDeclaration.judgeId, entryId: conflictDeclaration.entryId })
        .from(conflictDeclaration)
        .where(
          and(inArray(conflictDeclaration.entryId, ids), eq(conflictDeclaration.hasConflict, true)),
        )
    : [];
  const panel = await tx
    .select({ judgeId: judgeAssignment.judgeId, name: judgeProfile.displayName })
    .from(judgeAssignment)
    .innerJoin(
      judgeProfile,
      and(eq(judgeProfile.userId, judgeAssignment.judgeId), eq(judgeProfile.active, true)),
    )
    .innerJoin(
      user,
      and(eq(user.id, judgeAssignment.judgeId), eq(user.role, "JUDGE"), isNull(user.disabledAt)),
    )
    .where(and(eq(judgeAssignment.categoryId, categoryId), eq(judgeAssignment.round, round)));
  const recused = new Set(conflicts.map((c) => `${c.judgeId}:${c.entryId}`));
  const rows = entries.map((e) => {
    const mine = scores.filter((s) => s.entryId === e.id);
    const result = entryScore(
      mine.map((s) => ({
        judgeId: s.judgeId,
        submitted: s.submittedAt !== null,
        recused: recused.has(`${s.judgeId}:${e.id}`),
        criteria:
          s.impact !== null &&
          s.innovation !== null &&
          s.influence !== null &&
          s.referenceValidation !== null
            ? {
                impact: s.impact,
                innovation: s.innovation,
                influence: s.influence,
                referenceValidation: s.referenceValidation,
              }
            : null,
      })),
      weights as Weights,
    );
    const submittedBy = new Set(
      mine
        .filter((s) => s.submittedAt && !recused.has(`${s.judgeId}:${e.id}`))
        .map((s) => s.judgeId),
    );
    const missing = panel
      .filter((p) => !recused.has(`${p.judgeId}:${e.id}`) && !submittedBy.has(p.judgeId))
      .map((p) => p.name);
    return {
      entryId: e.id,
      nomineeName: e.nomineeName,
      nomineeCompany: e.nomineeCompany,
      ...result,
      missing,
    };
  });
  const ranked = rank(rows);
  return {
    name,
    cycleId,
    weights: weights as Weights,
    ranked,
    blockers: ranked.filter((r) => r.count < MIN_SCORES),
  };
}

/**
 * A saved selection the current scores no longer support (e.g. a late conflict) must be
 * made again. Only meaningful before announcement; afterwards the finalists are fixed.
 */
export function isSelectionStale(
  ranked: Ranked[],
  selection: { entryIds: string[]; tiebreakReason: string | null } | null | undefined,
  phase: string,
) {
  if (!selection || phase !== "ROUND1_CLOSED") return false;
  const n = selection.entryIds.length;
  return !checkSelection(ranked, n, selection.entryIds, selection.tiebreakReason ?? "").ok;
}

/** Admin: one category's round-one ranking, its saved selection and the phase. */
export async function getCategoryRanking(actor: Actor, categoryId: string) {
  assertRole(actor, "ADMIN");
  if (!isUuid(categoryId)) throw new NotFoundError("category");
  const r = await computeRanking(db, categoryId, 1);
  const [cycle] = await db
    .select({ phase: awardCycle.phase })
    .from(awardCycle)
    .where(eq(awardCycle.id, r.cycleId));
  const [selection] = await db
    .select()
    .from(finalistSelection)
    .where(eq(finalistSelection.categoryId, categoryId));
  const phase = cycle?.phase ?? "NOMINATION";
  return {
    ...r,
    phase,
    selection: selection ?? null,
    selectionStale: isSelectionStale(r.ranked, selection, phase),
  };
}
