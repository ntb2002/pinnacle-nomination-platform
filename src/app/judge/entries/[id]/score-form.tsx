"use client";

import { useActionState, useState } from "react";
import { TextArea } from "@/components/form/controls";
import { FormMessage } from "@/components/form/form-message";
import { idleState } from "@/lib/action-state";
import { CRITERIA, weightedScore, type Weights } from "@/lib/scoring";
import { scoreAction } from "../../actions";

const LABELS = Object.fromEntries(CRITERIA.map((c) => [c.key, c.label]));
const OPTIONS = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/**
 * The rubric: each criterion 1-10 with its weight. The weighted total shown here is a
 * preview; the server computes the real one. Drafts do not count until submitted.
 */
export function ScoreForm({
  entryId,
  round,
  weights,
  initial,
  submitted,
}: {
  entryId: string;
  round: 1 | 2;
  weights: Weights;
  initial: Record<string, string>;
  submitted: boolean;
}) {
  const [state, action, pending] = useActionState(scoreAction, idleState);
  const start = state.values ?? initial;
  const [v, setV] = useState(start);
  const nums = CRITERIA.map((c) => Number(v[c.key]));
  const complete = nums.every((n) => n >= 1 && n <= 10);
  const total = complete
    ? weightedScore(
        {
          impact: nums[0]!,
          innovation: nums[1]!,
          influence: nums[2]!,
          referenceValidation: nums[3]!,
        },
        weights,
      )
    : null;
  return (
    <form
      action={action}
      className="flex flex-col gap-5 rounded border border-line bg-surface p-6"
      key={JSON.stringify(state)}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="round" value={round} />
      <h2 className="font-display text-2xl font-semibold">Your score</h2>
      <p className="text-sm text-slate">
        {submitted ? "Submitted. You can revise it until the round closes." : "Not submitted yet."}{" "}
        Other judges&apos; scores are never shown.
      </p>
      <FormMessage state={state} labels={LABELS} idPrefix="score-" />
      <div className="grid gap-4 sm:grid-cols-2">
        {CRITERIA.map((c) => {
          const err = state.fieldErrors?.[c.key];
          return (
            <div key={c.key} className="flex flex-col gap-1.5">
              <label htmlFor={`score-${c.key}`} className="font-semibold">
                {c.label}{" "}
                <span className="font-normal text-slate">(weight {weights[c.weight]}%)</span>
              </label>
              {err && (
                <p id={`score-${c.key}-error`} className="text-sm font-semibold text-danger">
                  {err[0]}
                </p>
              )}
              <select
                id={`score-${c.key}`}
                name={c.key}
                defaultValue={start[c.key] ?? ""}
                onChange={(e) => setV({ ...v, [c.key]: e.target.value })}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `score-${c.key}-error` : undefined}
                className="rounded border-2 border-control bg-surface px-3 py-2"
              >
                {OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o === "" ? "Choose 1 to 10" : o}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <p aria-live="polite">
        Weighted score:{" "}
        <span className="font-semibold">
          {total === null ? "choose all four" : `${total.toFixed(1)} of 100`}
        </span>
      </p>
      <TextArea
        id="score-comment"
        name="comment"
        label="Comment (optional)"
        hint="For the program team. Not shown to nominators."
        rows={3}
        maxLength={2000}
        defaultValue={start.comment ?? ""}
        errors={state.fieldErrors?.comment}
      />
      <div className="flex flex-wrap gap-4">
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={pending}
          className="rounded border-2 border-ink px-5 py-3 font-semibold"
        >
          Save draft
        </button>
        <button
          type="submit"
          name="intent"
          value="submit"
          disabled={pending}
          className="rounded bg-ink px-5 py-3 font-semibold text-on-ink hover:bg-ink-raised"
        >
          {submitted ? "Submit revised score" : "Submit score"}
        </button>
      </div>
    </form>
  );
}
