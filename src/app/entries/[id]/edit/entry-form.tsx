"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form/form-message";
import { idleState, type ActionState } from "@/lib/action-state";
import { draftToFormValues, entryFieldLabel, entryFormToDraft } from "@/lib/entry-form";
import { draftSchema } from "@/lib/validation/entry";
import { saveEntryAction } from "../../actions";
import { NarrativeSection, NomineeSection, OutcomesSection, ReferencesSection } from "./sections";

/**
 * The entry form. Initial values come from the server; after a save or an error, the
 * submitted ones. The same draft schema the server uses runs here first, so length
 * problems show without a round trip (the server still checks everything).
 */
export function EntryForm({
  entryId,
  initial,
  selfNomination,
}: {
  entryId: string;
  initial: Record<string, string>;
  selfNomination: boolean;
}) {
  const [serverState, action, pending] = useActionState(
    saveEntryAction.bind(null, entryId),
    idleState,
  );
  const [clientState, setClientState] = useState<ActionState | null>(null);
  const state = clientState ?? serverState;
  const v = state.values ?? initial;
  const e = state.fieldErrors ?? {};

  function validateBeforeSubmit(event: React.FormEvent<HTMLFormElement>) {
    const draft = entryFormToDraft(new FormData(event.currentTarget).entries());
    const result = draftSchema.safeParse(draft);
    if (result.success) {
      setClientState(null);
      return;
    }
    event.preventDefault();
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      (fieldErrors[issue.path.map(String).join(".")] ??= []).push(issue.message);
    }
    setClientState({
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors,
      values: draftToFormValues(draft),
    });
  }

  return (
    <form
      key={JSON.stringify(state)}
      action={action}
      onSubmit={validateBeforeSubmit}
      className="flex flex-col gap-8"
      noValidate
    >
      <FormMessage state={state} labelFor={entryFieldLabel} />
      {/* Locked while saving: anything typed now would be replaced by the saved values. */}
      <fieldset disabled={pending} aria-busy={pending} className="flex flex-col gap-8">
        <NomineeSection v={v} e={e} selfNomination={selfNomination} />
        <NarrativeSection v={v} e={e} />
        <OutcomesSection v={v} e={e} />
        <ReferencesSection v={v} e={e} />
      </fieldset>
      {pending && (
        <p role="status" className="font-semibold">
          Saving…
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        {/* First in source order, so pressing Enter in a field saves without leaving. */}
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded border-2 border-ink px-5 py-3 font-semibold text-ink hover:bg-surface"
        >
          Save draft
        </button>
        <button
          type="submit"
          name="intent"
          value="review"
          disabled={pending}
          className="rounded bg-ink px-5 py-3 font-semibold text-on-ink hover:bg-ink-raised"
        >
          Save and review
        </button>
      </div>
    </form>
  );
}
