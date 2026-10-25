import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { awardCycle, category, entry, payment, user } from "@/server/db/schema";

/** How a payment row reads to an admin. Unpaid sessions past their expiry are "Expired". */
export function paymentLabel(
  p: { status: string; expiresAt: Date | null; reference: string | null },
  now = new Date(),
): "Paid" | "Checkout open" | "Expired" | "Failed" | "Refunded" | "Charged, needs review" {
  if (p.status === "PAID") return "Paid";
  if (p.status === "REFUNDED") return "Refunded";
  // A provider charge reference on an unpaid row: money was taken but not applied
  // (duplicate payment or wrong amount). Refund or resolve in the Stripe dashboard.
  if (p.reference) return "Charged, needs review";
  if (p.status === "FAILED") return "Failed";
  if (p.status === "PENDING" && p.expiresAt && p.expiresAt > now) return "Checkout open";
  return "Expired";
}

/**
 * Admin: payment attempts in the active cycle, newest first, with entry and nominator,
 * plus paid totals over all of them. Payment data is visible only to admins and to each entry's nominator.
 */
export async function listPayments(actor: Actor, limit = 200) {
  assertRole(actor, "ADMIN");
  const [totals] = await db
    .select({
      paid: sql<number>`count(*) filter (where ${payment.status} = 'PAID')::int`,
      paidCents: sql<number>`coalesce(sum(${payment.amountCents}) filter (where ${payment.status} = 'PAID'), 0)::int`,
    })
    .from(payment)
    .innerJoin(entry, eq(entry.id, payment.entryId))
    .innerJoin(awardCycle, eq(awardCycle.id, entry.cycleId))
    .where(eq(awardCycle.isActive, true));
  const rows = await db
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
  return { rows, totals: totals ?? { paid: 0, paidCents: 0 } };
}
