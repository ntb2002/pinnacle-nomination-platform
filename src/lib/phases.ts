/**
 * Cycle phases in order. They only advance, except reopening round one before finalists
 * are announced (docs/architecture.md → Status machines).
 */
export const PHASES = [
  "NOMINATION",
  "ROUND1_OPEN",
  "ROUND1_CLOSED",
  "FINALISTS_ANNOUNCED",
  "ROUND2_OPEN",
  "ROUND2_CLOSED",
  "RESULTS_PUBLISHED",
] as const;
export type Phase = (typeof PHASES)[number];
export type Round = 1 | 2;

const at = (p: string) => PHASES.indexOf(p as Phase);

/** True once `phase` has reached `since` (inclusive). */
export const reached = (phase: string, since: Phase) => at(phase) >= at(since);

/** A round's entries become readable by its judges when the round opens, and stay so. */
export const roundStarted = (phase: string, round: Round) =>
  reached(phase, round === 1 ? "ROUND1_OPEN" : "ROUND2_OPEN");

/** Scores can be entered or revised only while the round is open. */
export const roundOpen = (phase: string, round: Round) =>
  phase === (round === 1 ? "ROUND1_OPEN" : "ROUND2_OPEN");

/** Assignments for a round can change until the round closes. */
export const assignmentsOpen = (phase: string, round: Round) =>
  !reached(phase, round === 1 ? "ROUND1_CLOSED" : "ROUND2_CLOSED");
