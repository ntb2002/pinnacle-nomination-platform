import "server-only";
import { createHmac } from "node:crypto";
import { env, paymentConfigProblems, paymentsProvider } from "@/lib/env";
import { mockProvider, type MockProvider } from "./mock";
import type { PaymentProvider } from "./provider";
import { stripeProvider } from "./stripe";

let instance: PaymentProvider | undefined;

/**
 * The configured payment provider. Throws when the payment configuration is invalid
 * (the server also refuses to boot then), so no checkout can start misconfigured.
 */
export function paymentProvider(): PaymentProvider {
  if (instance) return instance;
  const problems = paymentConfigProblems();
  if (problems.length > 0) throw new Error(`Invalid payment configuration: ${problems.join("; ")}`);
  const e = env();
  instance =
    paymentsProvider(e) === "stripe"
      ? stripeProvider({ secretKey: e.STRIPE_SECRET_KEY!, webhookSecret: e.STRIPE_WEBHOOK_SECRET! })
      : mockProvider({
          // Derived, so the simulator needs no extra secret and never shares one with auth.
          secret: createHmac("sha256", e.BETTER_AUTH_SECRET)
            .update("pinnacle-mock-payments")
            .digest("hex"),
          appUrl: e.APP_URL,
        });
  return instance;
}

/** The mock provider, or null when another provider is configured. */
export function mockPaymentProvider(): MockProvider | null {
  const p = paymentProvider();
  return p.name === "mock" ? (p as MockProvider) : null;
}
