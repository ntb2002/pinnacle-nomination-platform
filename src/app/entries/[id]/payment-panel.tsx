"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { cancelCheckoutAction, startCheckoutAction } from "../actions";

/** "Pay and submit" for a ready draft. The amount shown is the server's; none is sent. */
export function PayButton({ entryId, label }: { entryId: string; label: string }) {
  const [state, action] = useActionState(startCheckoutAction.bind(null, entryId), idleState);
  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Opening checkout…">{label}</SubmitButton>
      </div>
    </form>
  );
}

/** For an open checkout: go back to paying, or cancel it to edit again. */
export function OpenCheckout({ entryId, until }: { entryId: string; until: string }) {
  const [payState, pay] = useActionState(startCheckoutAction.bind(null, entryId), idleState);
  const [cancelState, cancel] = useActionState(cancelCheckoutAction.bind(null, entryId), idleState);
  return (
    <div className="mt-4 flex flex-col gap-4">
      <p>
        You started paying for this entry. The checkout stays open until {until} Eastern. While it
        is open, the entry cannot be edited.
      </p>
      <FormMessage state={payState} />
      <FormMessage state={cancelState} />
      <div className="flex flex-wrap items-center gap-6">
        <form action={pay}>
          <SubmitButton pendingLabel="Opening checkout…">Continue to payment</SubmitButton>
        </form>
        <form action={cancel}>
          <button type="submit" className="font-semibold underline">
            Cancel the checkout to make changes
          </button>
        </form>
      </div>
    </div>
  );
}
