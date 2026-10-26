"use client";

import { useActionState } from "react";
import { TextArea } from "@/components/form/controls";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { selectFinalistsAction } from "../actions";

/**
 * Finalist choice. The top `count` are pre-selected; the server accepts only the top
 * `count` by score, with a free choice (and a reason) only among entries tied at the cut.
 */
export function SelectionForm({
  categoryId,
  count,
  rows,
  preselected,
  tie,
}: {
  categoryId: string;
  count: number;
  rows: { entryId: string; label: string }[];
  preselected: string[];
  tie: { tied: string[]; slots: number } | null;
}) {
  const [state, action] = useActionState(selectFinalistsAction, idleState);
  return (
    <form action={action} className="flex flex-col gap-4 rounded border border-line bg-surface p-6">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="count" value={count} />
      <FormMessage state={state} labels={{ entryIds: "Finalists", reason: "Reason" }} />
      <fieldset id="entryIds" tabIndex={-1} className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold">Choose {count} finalists</legend>
        {rows.map((r) => (
          <label key={r.entryId} className="flex items-center gap-3">
            <input
              type="checkbox"
              name="entryId"
              value={r.entryId}
              defaultChecked={preselected.includes(r.entryId)}
              className="h-5 w-5 accent-ink"
            />
            <span>
              {r.label}
              {tie?.tied.includes(r.entryId) && (
                <span className="font-semibold"> (tied at the cut-off)</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      {tie && (
        <>
          <p role="note" className="rounded border-l-4 border-signal px-4 py-3">
            {tie.tied.length} entries are tied at the cut-off for {tie.slots}{" "}
            {tie.slots === 1 ? "place" : "places"}. Choose among them and record why; the reason is
            stored and audited.
          </p>
          <TextArea
            id="reason"
            name="reason"
            label="Reason for the choice among tied entries"
            rows={3}
            maxLength={1000}
            defaultValue={state.values?.reason ?? ""}
            errors={state.fieldErrors?.reason}
          />
        </>
      )}
      <div>
        <SubmitButton pendingLabel="Saving…">Save the finalists</SubmitButton>
      </div>
    </form>
  );
}
