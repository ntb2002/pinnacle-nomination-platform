import { NextResponse, type NextRequest } from "next/server";
import { paymentsProvider } from "@/lib/env";
import { paymentProvider } from "@/server/payments";
import { clientIpFrom } from "@/server/request";
import { handleWebhook } from "@/server/services/payment-events";

/** Stripe sends small JSON events; anything larger is not one. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Stripe webhook endpoint. The signature (`Stripe-Signature`, STRIPE_WEBHOOK_SECRET) is
 * the only authentication; the body is read raw because verification needs the exact
 * bytes. Fulfilment is idempotent (handleWebhook). 404 unless Stripe is the provider.
 */
export async function POST(request: NextRequest) {
  if (paymentsProvider() !== "stripe") return new NextResponse("Not found.", { status: 404 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return new NextResponse("Too large.", { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new NextResponse("Too large.", { status: 413 });
  const result = await handleWebhook(
    paymentProvider(),
    raw,
    request.headers.get("stripe-signature"),
    clientIpFrom(request.headers),
  );
  return new NextResponse(result.body, { status: result.status });
}
