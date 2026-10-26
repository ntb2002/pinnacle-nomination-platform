/**
 * The payment provider boundary (#9, #13). The app decides amounts; a provider only
 * hosts the checkout page and reports what happened through signed events.
 * Card details never reach this app.
 */
export interface CheckoutRequest {
  /** Our payment row id; echoed back in events. */
  paymentId: string;
  amountCents: number;
  currency: "usd";
  /** Line-item text shown on the hosted page, e.g. "Pinnacle Awards entry: Top Strategist". */
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}

export interface CheckoutSession {
  sessionId: string;
  /** Where to send the nominator to pay. */
  url: string;
}

/** What a verified provider event means for us. */
export type CheckoutEvent =
  | {
      kind: "paid";
      eventId: string;
      sessionId: string;
      paymentIntentId: string | null;
      amountCents: number;
      currency: string;
    }
  | { kind: "expired" | "failed"; eventId: string; sessionId: string }
  | { kind: "ignored"; eventId: string; type: string };

export class WebhookSignatureError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "WebhookSignatureError";
  }
}

export interface PaymentProvider {
  readonly name: "stripe" | "mock";
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Ends an open session so it can no longer be paid. Returns false when the session
   * was already completed (a payment may be on its way).
   */
  expireCheckout(sessionId: string): Promise<boolean>;
  /** Verifies the signature and decodes the event, or throws WebhookSignatureError. */
  parseEvent(rawBody: string, signature: string | null): CheckoutEvent;
}
