"use client";

import { useActionState } from "react";
import { requestSignInAction } from "@/app/actions/auth";
import { Field } from "@/components/form/field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(requestSignInAction, idleState);
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <Field
        id="email"
        name="email"
        type="email"
        label="Email address"
        hint="We'll email you a link to sign in. No password needed."
        autoComplete="email"
        required
        defaultValue={state.values?.email ?? ""}
        key={state.values?.email ?? "empty"}
        errors={state.fieldErrors?.email}
      />
      <div>
        <SubmitButton pendingLabel="Sending link…">Email me a sign-in link</SubmitButton>
      </div>
    </form>
  );
}
