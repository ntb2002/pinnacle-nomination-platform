import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { categoryKind, cyclePhase } from "./enums";

const tz = () => timestamp({ withTimezone: true });

/** One awards year. Deadlines and fees are admin-configurable (#6). Money in cents. */
export const awardCycle = pgTable(
  "award_cycle",
  {
    id: uuid().primaryKey().defaultRandom(),
    year: integer().notNull().unique(),
    name: text().notNull(),
    /** Only one cycle is active (the one the app runs). */
    isActive: boolean().notNull().default(false),
    nominationsOpenAt: tz().notNull(),
    earlyDeadline: tz().notNull(),
    regularDeadline: tz().notNull(),
    /** Submissions close at this instant; entries at or after it are refused. */
    finalDeadline: tz().notNull(),
    earlyFeeCents: integer().notNull(),
    regularFeeCents: integer().notNull(),
    lateFeeCents: integer().notNull(),
    finalistFeeCents: integer().notNull(),
    phase: cyclePhase().notNull().default("NOMINATION"),
    round1OpenedAt: tz(),
    finalistsAnnouncedAt: tz(),
    round2OpenedAt: tz(),
    resultsPublishedAt: tz(),
    createdAt: tz().notNull().defaultNow(),
    updatedAt: tz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("award_cycle_one_active")
      .on(t.isActive)
      .where(sql`${t.isActive}`),
    check(
      "award_cycle_deadline_order",
      sql`${t.nominationsOpenAt} < ${t.earlyDeadline} AND ${t.earlyDeadline} < ${t.regularDeadline} AND ${t.regularDeadline} < ${t.finalDeadline}`,
    ),
    check(
      "award_cycle_fees_nonnegative",
      sql`${t.earlyFeeCents} >= 0 AND ${t.regularFeeCents} >= 0 AND ${t.lateFeeCents} >= 0 AND ${t.finalistFeeCents} >= 0`,
    ),
  ],
);

/**
 * Rubric weights for a category type (e.g. individual executive vs campaign).
 * Four integer weights summing to 100; locked once round 1 opens (#6).
 */
export const rubricProfile = pgTable(
  "rubric_profile",
  {
    id: uuid().primaryKey().defaultRandom(),
    cycleId: uuid()
      .notNull()
      .references(() => awardCycle.id, { onDelete: "cascade" }),
    key: text().notNull(),
    name: text().notNull(),
    weightImpact: smallint().notNull(),
    weightInnovation: smallint().notNull(),
    weightInfluence: smallint().notNull(),
    weightReferences: smallint().notNull(),
  },
  (t) => [
    uniqueIndex().on(t.cycleId, t.key),
    check(
      "rubric_profile_weights_sum_100",
      sql`${t.weightImpact} + ${t.weightInnovation} + ${t.weightInfluence} + ${t.weightReferences} = 100`,
    ),
    check(
      "rubric_profile_weights_range",
      sql`${t.weightImpact} BETWEEN 0 AND 100 AND ${t.weightInnovation} BETWEEN 0 AND 100 AND ${t.weightInfluence} BETWEEN 0 AND 100 AND ${t.weightReferences} BETWEEN 0 AND 100`,
    ),
  ],
);

export const category = pgTable(
  "category",
  {
    id: uuid().primaryKey().defaultRandom(),
    cycleId: uuid()
      .notNull()
      .references(() => awardCycle.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    kind: categoryKind().notNull(),
    enabled: boolean().notNull().default(true),
    rubricProfileId: uuid()
      .notNull()
      .references(() => rubricProfile.id),
    sortOrder: smallint().notNull().default(0),
  },
  (t) => [uniqueIndex().on(t.cycleId, t.slug)],
);

/** Public-facing judge details. A judge appears on /judges only when isPublic. */
export const judgeProfile = pgTable("judge_profile", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text().notNull(),
  title: text().notNull().default(""),
  organization: text().notNull().default(""),
  bio: text().notNull().default(""),
  isPublic: boolean().notNull().default(false),
  active: boolean().notNull().default(true),
  sortOrder: smallint().notNull().default(0),
});
