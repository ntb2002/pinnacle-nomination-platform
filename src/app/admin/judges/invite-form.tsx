"use client";

import { useActionState } from "react";
import { Field } from "@/components/form/field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { inviteJudgeAction } from "./actions";

const LABELS = {
  email: "Email",
  displayName: "Name",
  title: "Title",
  organization: "Organization",
};

/** Adds someone to the panel and emails them an invitation. */
export function InviteForm() {
  const [state, action] = useActionState(inviteJudgeAction, idleState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded border border-line bg-surface p-6"
      noValidate
    >
      <h2 className="font-display text-2xl font-semibold">Invite a judge</h2>
      <FormMessage state={state} labels={LABELS} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="email"
          name="email"
          type="email"
          label="Email"
          defaultValue={v.email}
          errors={e.email}
          autoComplete="off"
        />
        <Field
          id="displayName"
          name="displayName"
          label="Name"
          defaultValue={v.displayName}
          errors={e.displayName}
          maxLength={120}
        />
        <Field
          id="title"
          name="title"
          label="Title (optional)"
          defaultValue={v.title}
          errors={e.title}
          maxLength={120}
        />
        <Field
          id="organization"
          name="organization"
          label="Organization (optional)"
          defaultValue={v.organization}
          errors={e.organization}
          maxLength={160}
        />
      </div>
      <p className="text-sm text-slate">
        People with submitted nominations this cycle cannot judge it. The judge is emailed a sign-in
        link.
      </p>
      <div>
        <SubmitButton pendingLabel="Inviting…">Invite the judge</SubmitButton>
      </div>
    </form>
  );
}
