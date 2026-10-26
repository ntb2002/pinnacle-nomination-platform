"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/session";
import { ConflictError } from "@/server/errors";
import { getMockCheckout, payMockCheckout } from "@/server/services/mock-checkout";

/** Simulates a successful card payment, then returns like Stripe's success redirect. */
export async function payMockAction(sessionId: string) {
  const actor = await requireRole("NOMINATOR");
  const { entryId } = await getMockCheckout(actor, sessionId);
  try {
    await payMockCheckout(actor, sessionId);
  } catch (err) {
    // Paying from a stale page (cancelled, expired, replaced or already paid): no charge.
    if (err instanceof ConflictError) redirect(`/entries/${entryId}?checkout=stale`);
    throw err;
  }
  redirect(`/entries/${entryId}?checkout=done`);
}

/** Leaves checkout without paying, like Stripe's "back" link (the session stays open). */
export async function cancelMockAction(sessionId: string) {
  const actor = await requireRole("NOMINATOR");
  const { entryId } = await getMockCheckout(actor, sessionId);
  redirect(`/entries/${entryId}?checkout=cancelled`);
}
