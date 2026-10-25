import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";
import { db, type Transaction } from "@/server/db";
import { category, entry, entryStatusEvent, payment, user, webhookEvent } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { receiptEmail } from "@/server/email/templates";
import {
  WebhookSignatureError,
  type CheckoutEvent,
  type PaymentProvider,
} from "@/server/payments/provider";

export type WebhookResult = { status: 200 | 400; body: string };

/**
 * Handles one provider webhook delivery: verify, then apply exactly once.
 * - Bad or missing signature → 400 and an audit row (`webhook.rejected`).
 * - An event id seen before → 200, nothing changes (replays and retries).
 * - Anything unexpected throws → 500, so the provider retries; the event id is only
 *   recorded when the transaction commits.
 */
export async function handleWebhook(
  provider: PaymentProvider,
  rawBody: string,
  signature: string | null,
  ip?: string,
): Promise<WebhookResult> {
  let event: CheckoutEvent;
  try {
    event = provider.parseEvent(rawBody, signature);
  } catch (err) {
    if (!(err instanceof WebhookSignatureError)) throw err;
    await audit({
      actor: null,
      action: "webhook.rejected",
      targetType: "webhook",
      metadata: { provider: provider.name, reason: err.message },
      ip,
    });
    return { status: 400, body: "Invalid signature." };
  }
  const receipt = await db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(webhookEvent)
      .values({ provider: provider.name, id: event.eventId, type: event.kind })
      .onConflictDoNothing()
      .returning({ id: webhookEvent.id });
    if (!fresh || event.kind === "ignored") return null;
    const [p] = await tx
      .select()
      .from(payment)
      .where(
        and(eq(payment.provider, provider.name), eq(payment.providerSessionId, event.sessionId)),
      )
      .for("update");
    if (!p) {
      await audit(
        {
          actor: null,
          action: "webhook.unknown_session",
          targetType: "webhook",
          targetId: event.eventId,
          metadata: { provider: provider.name },
        },
        tx,
      );
      return null;
    }
    if (event.kind !== "paid") {
      if (p.status === "PENDING") {
        await tx
          .update(payment)
          .set({ status: event.kind === "expired" ? "EXPIRED" : "FAILED" })
          .where(eq(payment.id, p.id));
      }
      return null;
    }
    return fulfil(tx, p, event);
  });
  if (receipt) {
    // The payment is recorded; a mail failure must not make the provider retry (the
    // event id is already stored, so a retry would not resend it either).
    await sendReceipt(receipt).catch((err: unknown) => {
      const e = err as { name?: string; code?: string };
      console.error("Receipt email failed:", e?.name ?? typeof err, e?.code ?? "");
    });
  }
  return { status: 200, body: "ok" };
}

type Payment = typeof payment.$inferSelect;
type Paid = Extract<CheckoutEvent, { kind: "paid" }>;

/** Marks the payment paid and submits the entry. Returns what the receipt needs. */
async function fulfil(tx: Transaction, p: Payment, event: Paid) {
  if (p.status === "PAID") return null;
  const meta = { entryId: p.entryId, paymentId: p.id, eventId: event.eventId };
  if (event.amountCents !== p.amountCents || event.currency.toLowerCase() !== p.currency) {
    // Never fulfil on a different amount than we priced. A person must look at it.
    await audit(
      {
        actor: null,
        action: "payment.amount_mismatch",
        targetType: "payment",
        targetId: p.id,
        metadata: {
          ...meta,
          expected: p.amountCents,
          received: event.amountCents,
          currency: event.currency,
        },
      },
      tx,
    );
    return null;
  }
  const [other] = await tx
    .select({ id: payment.id })
    .from(payment)
    .where(
      and(
        eq(payment.entryId, p.entryId),
        eq(payment.kind, p.kind),
        eq(payment.status, "PAID"),
        ne(payment.id, p.id),
      ),
    )
    .limit(1);
  if (other) {
    // A second session for the same entry was paid (only possible in a race with the
    // provider). The entry stays paid once; this charge needs a refund.
    await audit(
      {
        actor: null,
        action: "payment.duplicate_needs_refund",
        targetType: "payment",
        targetId: p.id,
        metadata: { ...meta, paidPaymentId: other.id, paymentIntentId: event.paymentIntentId },
      },
      tx,
    );
    return null;
  }
  const paidAt = new Date();
  await tx
    .update(payment)
    .set({ status: "PAID", paidAt, providerPaymentIntentId: event.paymentIntentId })
    .where(eq(payment.id, p.id));
  const [e] = await tx.select().from(entry).where(eq(entry.id, p.entryId)).for("update");
  if (p.kind === "ENTRY_FEE" && e?.status === "DRAFT") {
    await tx
      .update(entry)
      .set({ status: "SUBMITTED", submittedAt: paidAt })
      .where(eq(entry.id, e.id));
    await tx.insert(entryStatusEvent).values({
      entryId: e.id,
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      note: "Entry fee paid",
    });
  }
  await audit(
    {
      actor: null,
      action: "payment.fulfilled",
      targetType: "payment",
      targetId: p.id,
      metadata: { ...meta, kind: p.kind, tier: p.tier, amountCents: p.amountCents },
    },
    tx,
  );
  const [info] = await tx
    .select({ email: user.email, categoryName: category.name, nomineeName: entry.nomineeName })
    .from(entry)
    .innerJoin(user, eq(user.id, entry.nominatorId))
    .innerJoin(category, eq(category.id, entry.categoryId))
    .where(eq(entry.id, p.entryId));
  return info
    ? { ...info, payment: { ...p, paidAt, providerPaymentIntentId: event.paymentIntentId } }
    : null;
}

async function sendReceipt(r: NonNullable<Awaited<ReturnType<typeof fulfil>>>) {
  await sendEmail({
    to: r.email,
    template: "payment_receipt",
    dedupeKey: `receipt:${r.payment.id}`,
    content: receiptEmail({
      categoryName: r.categoryName,
      nomineeName: r.nomineeName ?? "your nominee",
      amountCents: r.payment.amountCents,
      tier: r.payment.tier,
      paidAt: r.payment.paidAt,
      reference: r.payment.providerPaymentIntentId ?? r.payment.providerSessionId,
      entryUrl: `${env().APP_URL}/entries/${r.payment.entryId}`,
    }),
  });
}
