"use client";

import { useActionState, useState } from "react";
import { updateRubricAction } from "@/app/admin/settings/actions";
import { Field } from "@/components/form/field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { RUBRIC_CRITERIA } from "@/lib/program-defaults";

type Weights = Record<(typeof RUBRIC_CRITERIA)[number]["weightKey"], number>;

/** Edits one profile's four weights, with a live total. Disabled once judging starts. */
export function RubricForm({
  profileId,
  name,
  weights,
  locked,
}: {
  profileId: string;
  name: string;
  weights: Weights;
  locked: boolean;
}) {
  const [state, action] = useActionState(updateRubricAction, idleState);
  const [values, setValues] = useState<Weights>(weights);
  const total = Object.values(values).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const prefix = `rubric-${profileId}-`;
  const labels = Object.fromEntries([
    ...RUBRIC_CRITERIA.map((c) => [c.weightKey, c.label]),
    ["total", "Total"],
  ]);
  const totalError = state.fieldErrors?.total;
  return (
    <form
      action={action}
      className="flex flex-col gap-6 rounded border border-line bg-surface p-6"
      noValidate
    >
      <input type="hidden" name="profileId" value={profileId} />
      <h2 className="font-display text-2xl font-semibold">{name}</h2>
      <FormMessage state={state} labels={labels} idPrefix={prefix} />
      <fieldset disabled={locked} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Weights for {name}</legend>
        {RUBRIC_CRITERIA.map((c) => (
          <Field
            key={c.key}
            id={`${prefix}${c.weightKey}`}
            name={c.weightKey}
            label={`${c.label} (%)`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={Number.isFinite(values[c.weightKey]) ? values[c.weightKey] : ""}
            onChange={(e) => setValues({ ...values, [c.weightKey]: e.target.valueAsNumber })}
            errors={state.fieldErrors?.[c.weightKey]}
            invalidBecause={totalError ? `${prefix}total` : undefined}
          />
        ))}
      </fieldset>
      <p
        id={`${prefix}total`}
        tabIndex={-1}
        aria-live="polite"
        className={`font-semibold ${total === 100 ? "text-success" : "text-danger"}`}
      >
        Total: {total}%{total === 100 ? "" : " (must be 100%)"}
        {totalError && <span className="block text-danger">{totalError.join(" ")}</span>}
      </p>
      {!locked && (
        <div>
          <SubmitButton pendingLabel="Saving…">Save weights</SubmitButton>
        </div>
      )}
    </form>
  );
}
