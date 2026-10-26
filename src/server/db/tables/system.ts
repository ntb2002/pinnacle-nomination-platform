import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { emailStatus, userRole } from "./enums";

const tz = () => timestamp({ withTimezone: true });

/**
 * Append-only record of privileged actions (AGENTS.md → Audit everything privileged).
 * A database trigger (migration) rejects UPDATE and DELETE on this table.
 * Never put secrets or full PII in metadata.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    actorId: text(),
    actorRole: userRole(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.createdAt),
    index().on(t.actorId, t.createdAt),
    index().on(t.targetType, t.targetId),
    index().on(t.action),
  ],
);

/** Outbound email. In dev/test this table is the mailbox; in production it records delivery status. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    toAddress: text().notNull(),
    subject: text().notNull(),
    template: text().notNull(),
    textBody: text().notNull(),
    htmlBody: text().notNull(),
    /** Optional idempotency key (e.g. "receipt:<paymentId>") so retries never send twice. */
    dedupeKey: text().unique(),
    status: emailStatus().notNull().default("PENDING"),
    error: text(),
    /** SMTP delivery attempts so far (#16 reliability: retried with backoff, then by an admin). */
    attempts: integer().notNull().default(0),
    lastAttemptAt: tz(),
    /** When the retry sweep may try this row next; null once sent or out of attempts. */
    nextAttemptAt: tz(),
    createdAt: tz().notNull().defaultNow(),
    sentAt: tz(),
  },
  (t) => [
    index().on(t.toAddress, t.createdAt),
    index().on(t.status, t.createdAt),
    index().on(t.nextAttemptAt),
  ],
);

/** Fixed-window counters for rate limiting, shared across app instances (#4). */
// Named to avoid Better Auth's own `rateLimit` model (its adapter matches by schema key).
export const rateLimitWindow = pgTable(
  "rate_limit_window",
  {
    key: text().notNull(),
    windowStart: tz().notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
