"use client";

import { useActionState } from "react";
import { Checkbox } from "@/components/form/controls";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { roundStepAction } from "./actions";

/** The next step for round one, with what it means. */
export function RoundControls({
  phase,
  nominationsClosed,
  pendingReview,
  readyToAnnounce,
}: {
  phase: string;
  nominationsClosed: boolean;
  pendingReview: number;
  readyToAnnounce: boolean;
}) {
  const [state, action] = useActionState(roundStepAction, idleState);
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
        <p>Closing round one makes every submitted score final. Drafts do not count.</p>
        <div>
          <SubmitButton pendingLabel="Closing…">Close round one</SubmitButton>
        </div>
      </form>
    );
  }
  if (phase === "ROUND1_CLOSED") {
    return (
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
    );
  }
  return <p className={box}>Finalists have been announced.</p>;
}
