import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { mockProvider } from "@/server/payments/mock";
import { WebhookSignatureError } from "@/server/payments/provider";
import { stripeProvider } from "@/server/payments/stripe";

const secret = "whsec_testsecret";
const stripe = stripeProvider({ secretKey: "sk_test_unit", webhookSecret: secret });
const sdk = new Stripe("sk_test_unit");

const completed = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "evt_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: "pi_1",
        amount_total: 65_000,
        currency: "usd",
        ...overrides,
      },
    },
  });

describe("Stripe webhook verification", () => {
  it("accepts a correctly signed event", () => {
    const payload = completed();
    const header = sdk.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.parseEvent(payload, header)).toEqual({
      kind: "paid",
      eventId: "evt_1",
      sessionId: "cs_test_1",
      paymentIntentId: "pi_1",
      amountCents: 65_000,
      currency: "usd",
    });
  });

  it("rejects a bad, missing, foreign or stale signature and a tampered body", () => {
    const payload = completed();
    const header = sdk.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => stripe.parseEvent(payload, null)).toThrow(WebhookSignatureError);
    expect(() => stripe.parseEvent(payload, "t=1,v1=deadbeef")).toThrow(WebhookSignatureError);
    const foreign = sdk.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    expect(() => stripe.parseEvent(payload, foreign)).toThrow(WebhookSignatureError);
    const stale = sdk.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    expect(() => stripe.parseEvent(payload, stale)).toThrow(WebhookSignatureError);
    expect(() => stripe.parseEvent(completed({ amount_total: 1 }), header)).toThrow(
      WebhookSignatureError,
    );
  });

  it("maps expiry, unpaid and unrelated events", () => {
    const sign = (payload: string) => sdk.webhooks.generateTestHeaderString({ payload, secret });
    const unpaid = completed({ payment_status: "unpaid" });
    expect(stripe.parseEvent(unpaid, sign(unpaid)).kind).toBe("ignored");
    const expired = completed().replace("checkout.session.completed", "checkout.session.expired");
    expect(stripe.parseEvent(expired, sign(expired))).toMatchObject({
      kind: "expired",
      sessionId: "cs_test_1",
    });
    const other = completed().replace("checkout.session.completed", "charge.refunded");
    expect(stripe.parseEvent(other, sign(other)).kind).toBe("ignored");
  });
});

describe("mock provider signatures", () => {
  const mock = mockProvider({ secret: "a".repeat(64), appUrl: "http://localhost:3000" });

  it("round-trips a signed event and refuses a tampered one", () => {
    const { body, signature } = mock.signEvent({
      type: "paid",
      sessionId: "mock_cs_x",
      amountCents: 500,
    });
    expect(mock.parseEvent(body, signature)).toMatchObject({ kind: "paid", amountCents: 500 });
    expect(() => mock.parseEvent(body.replace("500", "5"), signature)).toThrow(
      WebhookSignatureError,
    );
    expect(() => mock.parseEvent(body, null)).toThrow(WebhookSignatureError);
    const other = mockProvider({ secret: "b".repeat(64), appUrl: "http://localhost:3000" });
    expect(() => other.parseEvent(body, signature)).toThrow(WebhookSignatureError);
  });

  it("creates sessions on the app's own simulator page", async () => {
    const s = await mock.createCheckout({
      paymentId: "p",
      amountCents: 500,
      currency: "usd",
      description: "x",
      customerEmail: "a@example.com",
      successUrl: "s",
      cancelUrl: "c",
      expiresAt: new Date(),
    });
    expect(s.sessionId).toMatch(/^mock_cs_[0-9a-f-]{36}$/);
    expect(s.url).toBe(`http://localhost:3000/dev/checkout/${s.sessionId}`);
  });
});
