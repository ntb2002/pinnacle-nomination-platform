"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/session";
import { getMockCheckout, payMockCheckout } from "@/server/services/mock-checkout";

/** Simulates a successful card payment, then returns like Stripe's success redirect. */
export async function payMockAction(sessionId: string) {
  const actor = await requireRole("NOMINATOR");
  const entryId = await payMockCheckout(actor, sessionId);
  redirect(`/entries/${entryId}?checkout=done`);
}

/** Leaves checkout without paying, like Stripe's "back" link (the session stays open). */
export async function cancelMockAction(sessionId: string) {
  const actor = await requireRole("NOMINATOR");
  const { entryId } = await getMockCheckout(actor, sessionId);
  redirect(`/entries/${entryId}?checkout=cancelled`);
}
