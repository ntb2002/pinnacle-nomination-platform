import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { feeTier, paymentKind, paymentStatus } from "./enums";
import { entry } from "./entries";

const tz = () => timestamp({ withTimezone: true });

/**
 * A checkout attempt for one entry (#9 entry fee, #13 finalist fee). The amount is
 * fixed server-side when the checkout session is created. Card data never reaches us.
 */
export const payment = pgTable(
  "payment",
  {
    id: uuid().primaryKey().defaultRandom(),
    entryId: uuid()
      .notNull()
      .references(() => entry.id),
    kind: paymentKind().notNull(),
    /** Entry-fee tier in force at session creation; null for finalist fees. */
    tier: feeTier(),
    amountCents: integer().notNull(),
    currency: text().notNull().default("usd"),
    status: paymentStatus().notNull().default("PENDING"),
    provider: text().notNull(),
    providerSessionId: text().notNull().unique(),
    providerPaymentIntentId: text(),
    /**
     * When the hosted checkout stops accepting payment (#9). Set on every checkout the
     * app creates; null (rows from before #9) counts as no longer open.
     */
    expiresAt: tz(),
    createdById: text()
      .notNull()
      .references(() => user.id),
    paidAt: tz(),
    createdAt: tz().notNull().defaultNow(),
    updatedAt: tz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.entryId),
    // Refund and dispute webhooks look payments up by payment intent.
    uniqueIndex("payment_provider_intent_unique")
      .on(t.provider, t.providerPaymentIntentId)
      .where(sql`${t.providerPaymentIntentId} IS NOT NULL`),
    // Policy: at most one paid fee of each kind per entry.
    uniqueIndex("payment_one_paid_per_kind")
      .on(t.entryId, t.kind)
      .where(sql`${t.status} = 'PAID'`),
    check("payment_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

/** Provider webhook events already processed (idempotency on event id). */
export const webhookEvent = pgTable(
  "webhook_event",
  {
    provider: text().notNull(),
    id: text().notNull(),
    type: text().notNull(),
    receivedAt: tz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.id] })],
);
