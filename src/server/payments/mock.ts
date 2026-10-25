import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { WebhookSignatureError, type PaymentProvider } from "./provider";

/**
 * A local stand-in for hosted checkout (development, CI, demo). "Checkout" is the
 * app's own /dev/checkout/<session> page; paying there produces an event signed like
 * a real webhook and fed through the same verification and fulfilment code.
 * Refused in real production by src/lib/env.ts.
 */
export function mockProvider(cfg: { secret: string; appUrl: string }): PaymentProvider & {
  signEvent(event: MockEvent): { body: string; signature: string };
} {
  const sign = (t: number, body: string) =>
    createHmac("sha256", cfg.secret).update(`${t}.${body}`).digest("hex");
  return {
    name: "mock",
    async createCheckout() {
      const sessionId = `mock_cs_${randomUUID()}`;
      return { sessionId, url: `${cfg.appUrl}/dev/checkout/${sessionId}` };
    },
    async expireCheckout() {
      // The mock page checks the payment row's status and expiry itself.
      return true;
    },
    signEvent(event) {
      const body = JSON.stringify({ id: `mock_evt_${randomUUID()}`, ...event });
      const t = Math.floor(Date.now() / 1000);
      return { body, signature: `t=${t},v1=${sign(t, body)}` };
    },
    parseEvent(rawBody, signature) {
      const m = signature?.match(/^t=(\d+),v1=([0-9a-f]{64})$/);
      if (!m) throw new WebhookSignatureError("missing signature");
      const t = Number(m[1]);
      const expected = Buffer.from(sign(t, rawBody), "hex");
      if (!timingSafeEqual(expected, Buffer.from(m[2]!, "hex"))) {
        throw new WebhookSignatureError("bad signature");
      }
      if (Math.abs(Date.now() / 1000 - t) > 300) throw new WebhookSignatureError("stale signature");
      const e = JSON.parse(rawBody) as MockEvent & { id: string };
      if (e.type === "paid") {
        return {
          kind: "paid",
          eventId: e.id,
          sessionId: e.sessionId,
          paymentIntentId: `mock_pi_${e.sessionId.slice(8)}`,
          amountCents: e.amountCents,
          currency: "usd",
        };
      }
      return { kind: e.type, eventId: e.id, sessionId: e.sessionId };
    },
  };
}

export type MockEvent =
  { type: "paid"; sessionId: string; amountCents: number } | { type: "expired"; sessionId: string };

export type MockProvider = ReturnType<typeof mockProvider>;
