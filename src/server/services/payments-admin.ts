import "server-only";
import { desc, eq } from "drizzle-orm";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { awardCycle, category, entry, payment, user } from "@/server/db/schema";

/** How a payment row reads to an admin. Unpaid sessions past their expiry are "Expired". */
export function paymentLabel(
  p: { status: string; expiresAt: Date | null },
  now = new Date(),
): "Paid" | "Checkout open" | "Expired" | "Failed" | "Refunded" {
  if (p.status === "PAID") return "Paid";
  if (p.status === "REFUNDED") return "Refunded";
  if (p.status === "FAILED") return "Failed";
  if (p.status === "PENDING" && p.expiresAt && p.expiresAt > now) return "Checkout open";
  return "Expired";
}

/**
 * Admin: every payment attempt in the active cycle, newest first, with its entry and
 * nominator. Payment data is visible only to admins and to each entry's nominator.
 */
export async function listPayments(actor: Actor, limit = 200) {
  assertRole(actor, "ADMIN");
  return db
    .select({
      id: payment.id,
      kind: payment.kind,
      tier: payment.tier,
      amountCents: payment.amountCents,
      status: payment.status,
      expiresAt: payment.expiresAt,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
      reference: payment.providerPaymentIntentId,
      entryId: entry.id,
      entryStatus: entry.status,
      nomineeName: entry.nomineeName,
      categoryName: category.name,
      nominatorEmail: user.email,
    })
    .from(payment)
    .innerJoin(entry, eq(entry.id, payment.entryId))
    .innerJoin(awardCycle, eq(awardCycle.id, entry.cycleId))
    .innerJoin(category, eq(category.id, entry.categoryId))
    .innerJoin(user, eq(user.id, entry.nominatorId))
    .where(eq(awardCycle.isActive, true))
    .orderBy(desc(payment.createdAt))
    .limit(limit);
}
