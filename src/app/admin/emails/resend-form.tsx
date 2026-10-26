"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { resendEmailAction } from "./actions";

/** One row's resend button. The id travels in a hidden input (no bound actions). */
export function ResendForm({ emailId, label }: { emailId: string; label: string }) {
  const [state, action] = useActionState(resendEmailAction, idleState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="emailId" value={emailId} />
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Sending…">
          Resend<span className="sr-only">: {label}</span>
        </SubmitButton>
      </div>
    </form>
  );
}
