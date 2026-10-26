"use client";

import { useActionState } from "react";
import { Checkbox, TextArea } from "@/components/form/controls";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState, type ActionState } from "@/lib/action-state";
import { roundStepAction } from "./actions";

/** The next step for round one, with what it means. */
export function RoundControls({
  phase,
  nominationsClosed,
  pendingReview,
  readyToAnnounce,
  blockers,
}: {
  phase: string;
  nominationsClosed: boolean;
  pendingReview: number;
  readyToAnnounce: boolean;
  /** Entries with fewer than 2 counted scores, across categories. */
  blockers: number;
}) {
  const [state, action] = useActionState(roundStepAction, idleState);
  const [reopenState, reopenAction] = useActionState(roundStepAction, idleState);
  const box = "flex flex-col gap-4 rounded border border-line bg-surface p-6";
  if (phase === "NOMINATION") {
    return (
      <form action={action} className={box}>
        <input type="hidden" name="step" value="open" />
        <FormMessage state={state} labels={{ confirm: "Confirmation" }} />
        <p>
          Opening round one lets judges score approved entries. It locks rubric weights and ends
          eligibility review.
          {!nominationsClosed && " Nominations are still open, so round one cannot open yet."}
        </p>
        {pendingReview > 0 && (
          <Checkbox
            id="confirm"
            name="confirm"
            label={`I understand ${pendingReview} ${pendingReview === 1 ? "entry" : "entries"} still in review will not be judged`}
          />
        )}
        <div>
          <SubmitButton pendingLabel="Opening…">Open round one</SubmitButton>
        </div>
      </form>
    );
  }
  if (phase === "ROUND1_OPEN") {
    return (
      <form action={action} className={box}>
        <input type="hidden" name="step" value="close" />
        <FormMessage state={state} />
        <p>
          Closing round one makes every submitted score final. Drafts do not count.
          {blockers > 0 &&
            ` ${blockers} ${blockers === 1 ? "entry has" : "entries have"} fewer than 2 scores, so round one cannot close yet. Assign another judge or wait for their scores.`}
        </p>
        <div>
          <SubmitButton pendingLabel="Closing…">Close round one</SubmitButton>
        </div>
      </form>
    );
  }
  if (phase === "ROUND1_CLOSED") {
    return (
      <div className="flex flex-col gap-6">
        <form action={action} className={box}>
          <input type="hidden" name="step" value="announce" />
          <FormMessage state={state} />
          <p>
            Announcing marks the chosen finalists, emails every nominator their result and opens the
            finalist package fee.
            {!readyToAnnounce && " Choose finalists for every category first."}
          </p>
          <div>
            <SubmitButton pendingLabel="Announcing…">Announce finalists</SubmitButton>
          </div>
        </form>
        {/* Open after a submission so an error shows without JavaScript. */}
        <details className={box} open={reopenState.status !== "idle" || undefined}>
          <summary className="cursor-pointer font-semibold">Reopen round one</summary>
          <ReopenForm state={reopenState} action={reopenAction} />
        </details>
      </div>
    );
  }
  return <p className={box}>Finalists have been announced.</p>;
}

/** Reopening (before announcement) clears saved finalist choices; needs an audited reason. */
function ReopenForm({ state, action }: { state: ActionState; action: (form: FormData) => void }) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="step" value="reopen" />
      <FormMessage state={state} labels={{ reason: "Reason" }} />
      <p>
        For when an entry is left short of scores, for example by a late conflict: judges can score
        again and you can assign another judge. Saved finalist choices are cleared.
      </p>
      <TextArea
        id="reason"
        name="reason"
        label="Reason for reopening"
        hint="Recorded in the audit log."
        rows={3}
        maxLength={500}
        defaultValue={state.values?.reason ?? ""}
        errors={state.fieldErrors?.reason}
      />
      <div>
        <SubmitButton pendingLabel="Reopening…">Reopen round one</SubmitButton>
      </div>
    </form>
  );
}
