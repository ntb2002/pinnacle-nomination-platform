/**
 * Round scoring (#12): the single place scores, means and finalist rules are computed
 * (AGENTS.md: never in the client). Pure and unit tested.
 */
export interface Weights {
  weightImpact: number;
  weightInnovation: number;
  weightInfluence: number;
  weightReferences: number;
}

export interface Criteria {
  impact: number;
  innovation: number;
  influence: number;
  referenceValidation: number;
}

export const CRITERIA = [
  { key: "impact", weight: "weightImpact", label: "Impact & Results" },
  { key: "innovation", weight: "weightInnovation", label: "Innovation" },
  { key: "influence", weight: "weightInfluence", label: "Industry Influence" },
  { key: "referenceValidation", weight: "weightReferences", label: "Reference Validation" },
] as const;

/** One judge's weighted score: Σ(score × weight) / 10, from 10 to 100 (weights sum to 100). */
export function weightedScore(s: Criteria, w: Weights): number {
  return (
    (s.impact * w.weightImpact +
      s.innovation * w.weightInnovation +
      s.influence * w.weightInfluence +
      s.referenceValidation * w.weightReferences) /
    10
  );
}

/** Rounds to 2 decimal places: how means are shown and compared for ties. */
export const to2dp = (x: number) => Math.round(x * 100) / 100;

export interface JudgeScore {
  judgeId: string;
  criteria: Criteria | null;
  submitted: boolean;
  /** The judge has a conflict on this entry: their score never counts. */
  recused: boolean;
}

/** An entry's score: the mean of submitted, unrecused judges' weighted scores. */
export function entryScore(scores: JudgeScore[], w: Weights) {
  const counted = scores
    .filter((s) => s.submitted && !s.recused && s.criteria)
    .map((s) => weightedScore(s.criteria!, w));
  const count = counted.length;
  if (count === 0) return { mean: null, sd: null, count };
  const mean = counted.reduce((a, b) => a + b, 0) / count;
  const sd = Math.sqrt(counted.reduce((a, b) => a + (b - mean) ** 2, 0) / count);
  return { mean, sd, count };
}

export interface Ranked {
  entryId: string;
  mean: number | null;
  count: number;
}

/** Highest mean first; unscored entries last; equal means keep a stable order by id. */
export function rank<T extends Ranked>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.mean === null || b.mean === null) {
      return a.mean === b.mean ? a.entryId.localeCompare(b.entryId) : a.mean === null ? 1 : -1;
    }
    return to2dp(b.mean) - to2dp(a.mean) || a.entryId.localeCompare(b.entryId);
  });
}

/** The finalist count allowed for a category: 3 to 5, or every entry when there are fewer than 3. */
export function allowedCounts(entries: number): number[] {
  if (entries < 3) return entries > 0 ? [entries] : [];
  return [3, 4, 5].filter((n) => n <= entries);
}

/**
 * The tie at the cut-off for top `n`: entries whose 2dp mean equals the n-th entry's,
 * when that group crosses the cut. `above` must all be finalists; `slots` of the
 * `tied` entries complete the list. Null when the cut falls cleanly.
 */
export function cutoffTie(ranked: Ranked[], n: number) {
  const nth = ranked[n - 1];
  if (!nth || nth.mean === null || ranked.length <= n) return null;
  const at = to2dp(nth.mean);
  const tied = ranked.filter((r) => r.mean !== null && to2dp(r.mean) === at);
  if (tied.length <= 1 || !tied.some((t) => ranked.indexOf(t) >= n)) return null;
  const above = ranked.slice(0, n).filter((r) => !tied.includes(r));
  return {
    above: above.map((r) => r.entryId),
    tied: tied.map((r) => r.entryId),
    slots: n - above.length,
  };
}

export type SelectionCheck = { ok: true; tiebreak: boolean } | { ok: false; error: string };

/**
 * Methodology rule (#12 AC 5, 8): finalists are exactly the top `n` by mean. The only
 * discretion is among entries tied at the cut, and that choice needs a reason.
 */
export function checkSelection(
  ranked: Ranked[],
  n: number,
  chosen: string[],
  reason: string,
): SelectionCheck {
  if (!allowedCounts(ranked.length).includes(n)) {
    return {
      ok: false,
      error: "Choose 3 to 5 finalists (all entries when there are fewer than 3).",
    };
  }
  if (ranked.some((r) => r.mean === null))
    return { ok: false, error: "Every entry needs scores before finalists are chosen." };
  const set = new Set(chosen);
  if (set.size !== chosen.length || set.size !== n)
    return { ok: false, error: `Choose exactly ${n} finalists.` };
  if (!chosen.every((id) => ranked.some((r) => r.entryId === id)))
    return { ok: false, error: "Choose finalists from this category's entries." };
  const tie = cutoffTie(ranked, n);
  if (!tie) {
    const top = ranked.slice(0, n).map((r) => r.entryId);
    return top.every((id) => set.has(id))
      ? { ok: true, tiebreak: false }
      : { ok: false, error: `Finalists must be the top ${n} entries by score.` };
  }
  if (!tie.above.every((id) => set.has(id))) {
    return {
      ok: false,
      error: "Every entry ranked above the tie at the cut-off must be a finalist.",
    };
  }
  const fromTie = chosen.filter((id) => !tie.above.includes(id));
  if (fromTie.length !== tie.slots || !fromTie.every((id) => tie.tied.includes(id))) {
    return { ok: false, error: `Choose ${tie.slots} of the entries tied at the cut-off.` };
  }
  if (reason.trim().length < 10) {
    return {
      ok: false,
      error: "Explain the choice among the tied entries (at least 10 characters).",
    };
  }
  return { ok: true, tiebreak: true };
}
