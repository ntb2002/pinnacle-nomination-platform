"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form/form-message";
import { idleState } from "@/lib/action-state";
import { saveEntryAction } from "../../actions";
import { NarrativeSection, NomineeSection, OutcomesSection, ReferencesSection } from "./sections";

const LABELS: Record<string, string> = {
  nomineeName: "Nominee's name",
  nomineeTitle: "Nominee's title",
  nomineeCompany: "Nominee's company",
  nomineeEmail: "Nominee's email",
  nomineeLinkedinUrl: "LinkedIn profile",
  narrative: "Narrative",
};

/** The entry form. Initial values come from the server; after an error, the submitted ones. */
export function EntryForm({
  entryId,
  initial,
}: {
  entryId: string;
  initial: Record<string, string>;
}) {
  const [state, action] = useActionState(saveEntryAction.bind(null, entryId), idleState);
  const v = state.values ?? initial;
  const e = state.fieldErrors ?? {};
  return (
    <form key={JSON.stringify(v)} action={action} className="flex flex-col gap-8" noValidate>
      <FormMessage state={state} labels={LABELS} />
      <NomineeSection v={v} e={e} />
      <NarrativeSection v={v} e={e} />
      <OutcomesSection v={v} e={e} />
      <ReferencesSection v={v} e={e} />
      <div className="flex flex-wrap gap-4">
        <button
          type="submit"
          name="intent"
          value="review"
          className="rounded bg-ink px-5 py-3 font-semibold text-on-ink hover:bg-ink-raised"
        >
          Save and review
        </button>
        <button
          type="submit"
          name="intent"
          value="save"
          className="rounded border-2 border-ink px-5 py-3 font-semibold text-ink hover:bg-surface"
        >
          Save draft
        </button>
      </div>
    </form>
  );
}
