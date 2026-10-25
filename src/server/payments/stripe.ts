import "server-only";
import Stripe from "stripe";
import { WebhookSignatureError, type CheckoutEvent, type PaymentProvider } from "./provider";

/** Signed events older than this are refused (replay window). Stripe's default. */
const TOLERANCE_SECONDS = 300;

/**
 * Stripe hosted Checkout. Card payments only, so `checkout.session.completed` means
 * the money was taken (no delayed methods to reconcile). Test keys in development,
 * live keys only in production (enforced in src/lib/env.ts).
 */
export function stripeProvider(cfg: { secretKey: string; webhookSecret: string }): PaymentProvider {
  // Short waits: checkout start holds the entry lock across these calls.
  const stripe = new Stripe(cfg.secretKey, { maxNetworkRetries: 1, timeout: 8_000 });
  return {
    name: "stripe",
    async createCheckout(req) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          // Cards settle immediately, so "completed" always means paid.
          allowed_payment_method_types: ["card"],
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: req.currency,
                unit_amount: req.amountCents,
                product_data: { name: req.description },
              },
            },
          ],
          client_reference_id: req.paymentId,
          metadata: { paymentId: req.paymentId },
          payment_intent_data: { metadata: { paymentId: req.paymentId } },
          customer_email: req.customerEmail,
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
          expires_at: Math.floor(req.expiresAt.getTime() / 1000),
        },
        // A retried request returns the same session instead of creating a second one.
        { idempotencyKey: `checkout-${req.paymentId}` },
      );
      if (!session.url) throw new Error("Stripe returned a session without a URL");
      return { sessionId: session.id, url: session.url };
    },
    async expireCheckout(sessionId) {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      if (s.status === "complete") return false;
      if (s.status !== "open") return true;
      try {
        await stripe.checkout.sessions.expire(sessionId);
        return true;
      } catch (err) {
        // Completed between the two calls: the payment is on its way.
        const again = await stripe.checkout.sessions.retrieve(sessionId);
        if (again.status === "complete") return false;
        throw err;
      }
    },
    parseEvent(rawBody, signature) {
      if (!signature) throw new WebhookSignatureError("missing signature");
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          signature,
          cfg.webhookSecret,
          TOLERANCE_SECONDS,
        );
      } catch {
        throw new WebhookSignatureError("bad signature");
      }
      return toCheckoutEvent(event);
    },
  };
}

export function toCheckoutEvent(event: Stripe.Event): CheckoutEvent {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.payment_status !== "paid")
        return { kind: "ignored", eventId: event.id, type: event.type };
      return {
        kind: "paid",
        eventId: event.id,
        sessionId: s.id,
        paymentIntentId:
          typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
        amountCents: s.amount_total ?? 0,
        currency: s.currency ?? "",
      };
    }
    case "checkout.session.expired":
      return { kind: "expired", eventId: event.id, sessionId: event.data.object.id };
    case "checkout.session.async_payment_failed":
      return { kind: "failed", eventId: event.id, sessionId: event.data.object.id };
    default:
      return { kind: "ignored", eventId: event.id, type: event.type };
  }
}
