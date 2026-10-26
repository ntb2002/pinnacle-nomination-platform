"use client";

import { useActionState } from "react";
import { TextArea } from "@/components/form/controls";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { declareAction } from "../../actions";

/**
 * Per-entry conflict declaration. `current` is the judge's earlier answer: after "no
 * conflict" they can still declare a conflict (e.g. they turn out to be a reference).
 */
export function DeclareForm({
  entryId,
  categoryId,
  round,
  nominee,
  current,
}: {
  entryId: string;
  categoryId: string;
  round: 1 | 2;
  nominee: string;
  current: boolean | null;
}) {
  const [state, action] = useActionState(declareAction, idleState);
  const v = state.values ?? {};
  const p = `${entryId}-`;
  if (current === false && state.status !== "error") {
    return (
      <details className="mt-2" open={state.status !== "idle" || undefined}>
        <summary className="cursor-pointer text-sm font-semibold underline">
          I have a conflict after all<span className="sr-only"> with {nominee}</span>
        </summary>
        <form action={action} className="mt-3 flex flex-col gap-3">
          <Hidden entryId={entryId} categoryId={categoryId} round={round} />
          <input type="hidden" name="conflict" value="yes" />
          <FormMessage state={state} idPrefix={p} labels={{ reason: "Reason" }} />
          <TextArea
            id={`${p}reason`}
            name="reason"
            label="Why you have a conflict"
            hint="Only the program team sees this."
            rows={2}
            maxLength={500}
            errors={state.fieldErrors?.reason}
          />
          <div>
            <SubmitButton pendingLabel="Saving…">Declare the conflict</SubmitButton>
          </div>
        </form>
      </details>
    );
  }
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <Hidden entryId={entryId} categoryId={categoryId} round={round} />
      <FormMessage
        state={state}
        idPrefix={p}
        labels={{ conflict: "Your answer", reason: "Reason" }}
      />
      <fieldset
        id={`${p}conflict`}
        tabIndex={-1}
        aria-describedby={state.fieldErrors?.conflict ? `${p}conflict-error` : undefined}
        className="flex flex-col gap-2"
      >
        <legend className="font-semibold">
          Do you have a conflict of interest with {nominee}?
        </legend>
        {state.fieldErrors?.conflict && (
          <p id={`${p}conflict-error`} className="text-sm font-semibold text-danger">
            {state.fieldErrors.conflict[0]}
          </p>
        )}
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="conflict"
            value="no"
            defaultChecked={v.conflict === "no"}
            className="h-5 w-5 accent-ink"
          />
          No conflict
        </label>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="conflict"
            value="yes"
            defaultChecked={v.conflict === "yes"}
            className="h-5 w-5 accent-ink"
          />
          I have a conflict (I will be recused)
        </label>
      </fieldset>
      <TextArea
        id={`${p}reason`}
        name="reason"
        label="If you have a conflict, why"
        hint="For example: worked together in the last three years. Only the program team sees this."
        rows={2}
        maxLength={500}
        defaultValue={v.reason ?? ""}
        errors={state.fieldErrors?.reason}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save my answer</SubmitButton>
      </div>
    </form>
  );
}

function Hidden({
  entryId,
  categoryId,
  round,
}: {
  entryId: string;
  categoryId: string;
  round: 1 | 2;
}) {
  return (
    <>
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="round" value={round} />
    </>
  );
}
