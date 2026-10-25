import "server-only";
import { and, eq } from "drizzle-orm";
import { assertRole, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { category, entry, payment } from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import { mockPaymentProvider } from "@/server/payments";
import { handleWebhook } from "./payment-events";

const SESSION_RE = /^mock_cs_[0-9a-f-]{36}$/;

/**
 * The mock provider's hosted page (development, CI, demo only). Shows the session the
 * nominator started; NotFound for anyone else's, for unknown sessions, and whenever the
 * mock provider is not the configured one.
 */
export async function getMockCheckout(actor: Actor, sessionId: string, now = new Date()) {
  assertRole(actor, "NOMINATOR");
  if (!mockPaymentProvider() || !SESSION_RE.test(sessionId)) throw new NotFoundError("checkout");
  const [row] = await db
    .select({
      entryId: payment.entryId,
      status: payment.status,
      amountCents: payment.amountCents,
      tier: payment.tier,
      expiresAt: payment.expiresAt,
      categoryName: category.name,
      nomineeName: entry.nomineeName,
    })
    .from(payment)
    .innerJoin(entry, eq(entry.id, payment.entryId))
    .innerJoin(category, eq(category.id, entry.categoryId))
    .where(
      and(
        eq(payment.provider, "mock"),
        eq(payment.providerSessionId, sessionId),
        eq(payment.createdById, actor.id),
      ),
    );
  if (!row) throw new NotFoundError("checkout");
  const payable = row.status === "PENDING" && !!row.expiresAt && row.expiresAt > now;
  return { ...row, payable };
}

/**
 * "Pays" a mock session: builds the signed event the provider would send and feeds it
 * through the same verification and fulfilment as a real webhook.
 */
export async function payMockCheckout(actor: Actor, sessionId: string) {
  const session = await getMockCheckout(actor, sessionId);
  if (!session.payable) throw new ConflictError("This checkout has ended. Start a new one.");
  const provider = mockPaymentProvider()!;
  const { body, signature } = provider.signEvent({
    type: "paid",
    sessionId,
    amountCents: session.amountCents,
  });
  const result = await handleWebhook(provider, body, signature);
  if (result.status !== 200) throw new Error("mock webhook rejected");
  return session.entryId;
}
