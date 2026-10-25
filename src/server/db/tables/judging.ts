import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { resultDecision } from "./enums";
import { entry } from "./entries";
import { awardCycle, category } from "./program";

const tz = () => timestamp({ withTimezone: true });

/** A judge assigned to a category for a round (1 or 2). */
export const judgeAssignment = pgTable(
  "judge_assignment",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Judges are retired via judge_profile.active / user.disabled_at, never deleted:
    // their assignments, declarations and scores are the record of how results were reached.
    judgeId: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    categoryId: uuid()
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    round: smallint().notNull(),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.judgeId, t.categoryId, t.round),
    index().on(t.categoryId, t.round),
    check("judge_assignment_round", sql`${t.round} IN (1, 2)`),
  ],
);

/**
 * A judge's conflict-of-interest declaration for one entry, made before they can
 * open it (#11). hasConflict = recused. One declaration per judge per entry, across rounds.
 */
export const conflictDeclaration = pgTable(
  "conflict_declaration",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Judges are retired via judge_profile.active / user.disabled_at, never deleted:
    // their assignments, declarations and scores are the record of how results were reached.
    judgeId: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    entryId: uuid()
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    hasConflict: boolean().notNull(),
    reason: text(),
    declaredAt: tz().notNull().defaultNow(),
    /** Set when an admin records or clears a recusal on the judge's behalf. */
    recordedById: text().references(() => user.id),
    adminNote: text(),
  },
  (t) => [uniqueIndex().on(t.judgeId, t.entryId), index().on(t.entryId)],
);

/**
 * One judge's rubric scores for one entry in one round. Criteria are 1-10; null
 * while the score is a draft. submittedAt marks it final (revisable until the round closes).
 */
export const score = pgTable(
  "score",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Judges are retired via judge_profile.active / user.disabled_at, never deleted:
    // their assignments, declarations and scores are the record of how results were reached.
    judgeId: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    entryId: uuid()
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    round: smallint().notNull(),
    impact: smallint(),
    innovation: smallint(),
    influence: smallint(),
    referenceValidation: smallint(),
    comment: text(),
    submittedAt: tz(),
    updatedAt: tz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex().on(t.judgeId, t.entryId, t.round),
    index().on(t.entryId, t.round),
    check("score_round", sql`${t.round} IN (1, 2)`),
    check(
      "score_criteria_range",
      sql`(${t.impact} IS NULL OR ${t.impact} BETWEEN 1 AND 10) AND (${t.innovation} IS NULL OR ${t.innovation} BETWEEN 1 AND 10) AND (${t.influence} IS NULL OR ${t.influence} BETWEEN 1 AND 10) AND (${t.referenceValidation} IS NULL OR ${t.referenceValidation} BETWEEN 1 AND 10)`,
    ),
    check(
      "score_submitted_complete",
      sql`${t.submittedAt} IS NULL OR (${t.impact} IS NOT NULL AND ${t.innovation} IS NOT NULL AND ${t.influence} IS NOT NULL AND ${t.referenceValidation} IS NOT NULL)`,
    ),
  ],
);

/** The confirmed winner of a category (#14). Embargoed until the cycle's results are published. */
export const categoryResult = pgTable(
  "category_result",
  {
    id: uuid().primaryKey().defaultRandom(),
    cycleId: uuid()
      .notNull()
      .references(() => awardCycle.id, { onDelete: "restrict" }),
    categoryId: uuid()
      .notNull()
      .references(() => category.id, { onDelete: "restrict" }),
    winnerEntryId: uuid().notNull(),
    decision: resultDecision().notNull(),
    tiebreakReason: text(),
    confirmedById: text()
      .notNull()
      .references(() => user.id),
    confirmedAt: tz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.cycleId, t.categoryId),
    // The winner must be an entry in this result's category.
    foreignKey({
      name: "category_result_winner_in_category_fk",
      columns: [t.winnerEntryId, t.categoryId],
      foreignColumns: [entry.id, entry.categoryId],
    }).onDelete("restrict"),
    check(
      "category_result_tiebreak_reason",
      sql`${t.decision} <> 'TIEBREAK' OR (${t.tiebreakReason} IS NOT NULL AND length(trim(${t.tiebreakReason})) > 0)`,
    ),
  ],
);
