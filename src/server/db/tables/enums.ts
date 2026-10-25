import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["NOMINATOR", "JUDGE", "ADMIN"]);

/** Cycle phases advance one way, by admin action (docs/architecture.md → Cycle phases). */
export const cyclePhase = pgEnum("cycle_phase", [
  "NOMINATION",
  "ROUND1_OPEN",
  "ROUND1_CLOSED",
  "FINALISTS_ANNOUNCED",
  "ROUND2_OPEN",
  "ROUND2_CLOSED",
  "RESULTS_PUBLISHED",
]);

export const categoryKind = pgEnum("category_kind", ["CORE", "OPTIONAL"]);
export const nominatorRelationship = pgEnum("nominator_relationship", ["SELF", "PEER", "STAFF"]);
export const entryStatus = pgEnum("entry_status", ["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"]);
export const returnReason = pgEnum("return_reason", ["INCOMPLETE", "WRONG_CATEGORY", "OTHER"]);
export const paymentKind = pgEnum("payment_kind", ["ENTRY_FEE", "FINALIST_FEE"]);
export const feeTier = pgEnum("fee_tier", ["EARLY", "REGULAR", "LATE"]);
export const paymentStatus = pgEnum("payment_status", [
  "PENDING",
  "PAID",
  "EXPIRED",
  "FAILED",
  "REFUNDED",
]);
export const resultDecision = pgEnum("result_decision", ["SCORE", "TIEBREAK"]);
export const emailStatus = pgEnum("email_status", ["PENDING", "SENT", "FAILED"]);
