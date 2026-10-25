import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { entryStatus, nominatorRelationship, returnReason } from "./enums";
import { awardCycle, category } from "./program";

const tz = () => timestamp({ withTimezone: true });

/**
 * One nominee in one category, billed separately. Nominee fields are nullable so
 * a draft can be saved with partial data; "ready to submit" is validated in code (#7).
 * Confidential: readable by its nominator, admins, and assigned unrecused judges only.
 */
export const entry = pgTable(
  "entry",
  {
    id: uuid().primaryKey().defaultRandom(),
    cycleId: uuid()
      .notNull()
      .references(() => awardCycle.id),
    categoryId: uuid()
      .notNull()
      .references(() => category.id),
    nominatorId: text()
      .notNull()
      .references(() => user.id),
    relationship: nominatorRelationship().notNull(),
    nomineeName: text(),
    nomineeTitle: text(),
    nomineeCompany: text(),
    nomineeEmail: text(),
    nomineeLinkedinUrl: text(),
    narrative: text(),
    status: entryStatus().notNull().default("DRAFT"),
    /** Admin's round-one finalist selection. Shown outside admin only after announcement. */
    isFinalist: boolean().notNull().default(false),
    finalistFeeWaivedAt: tz(),
    finalistFeeWaivedById: text().references(() => user.id),
    finalistFeeWaiverReason: text(),
    submittedAt: tz(),
    createdAt: tz().notNull().defaultNow(),
    updatedAt: tz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.cycleId, t.categoryId, t.status),
    index().on(t.nominatorId),
    // Policy: a nominator cannot open two entries for the same nominee in the same category.
    uniqueIndex("entry_one_per_nominee_category")
      .on(t.cycleId, t.categoryId, t.nominatorId, sql`lower(${t.nomineeEmail})`)
      .where(sql`${t.nomineeEmail} IS NOT NULL`),
  ],
);

/** 2-3 quantified outcomes per entry, each with a data point. */
export const entryOutcome = pgTable(
  "entry_outcome",
  {
    id: uuid().primaryKey().defaultRandom(),
    entryId: uuid()
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    description: text().notNull(),
    dataPoint: text().notNull(),
  },
  (t) => [
    uniqueIndex().on(t.entryId, t.position),
    check("entry_outcome_position", sql`${t.position} BETWEEN 1 AND 3`),
  ],
);

/** 1-2 references. Contact details are admin-only (judges see name/title/org/relationship). */
export const entryReference = pgTable(
  "entry_reference",
  {
    id: uuid().primaryKey().defaultRandom(),
    entryId: uuid()
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    name: text().notNull(),
    title: text().notNull(),
    organization: text().notNull(),
    email: text().notNull(),
    phone: text().notNull(),
    relationship: text().notNull(),
  },
  (t) => [
    uniqueIndex().on(t.entryId, t.position),
    check("entry_reference_position", sql`${t.position} BETWEEN 1 AND 2`),
  ],
);

/** Supporting files (#8). Stored under a random key; the original name is display-only. */
export const attachment = pgTable(
  "attachment",
  {
    id: uuid().primaryKey().defaultRandom(),
    entryId: uuid()
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    storageKey: text().notNull().unique(),
    originalName: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    sha256: text().notNull(),
    uploadedById: text()
      .notNull()
      .references(() => user.id),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [index().on(t.entryId)],
);

/** Every status change on an entry: the triage timeline (#10). */
export const entryStatusEvent = pgTable(
  "entry_status_event",
  {
    id: uuid().primaryKey().defaultRandom(),
    entryId: uuid()
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    fromStatus: entryStatus(),
    toStatus: entryStatus().notNull(),
    actorId: text().references(() => user.id),
    returnReason: returnReason(),
    /** Message to the nominator (returns) or internal note. */
    note: text(),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [index().on(t.entryId, t.createdAt)],
);
