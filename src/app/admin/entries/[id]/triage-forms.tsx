"use client";

import { useActionState } from "react";
import { TextArea } from "@/components/form/controls";
import { FormMessage } from "@/components/form/form-message";
import { RadioGroup } from "@/components/form/radio-group";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { approveEntryAction, returnEntryAction } from "../actions";

const LABELS = { reason: "Reason", message: "Message to the nominator", note: "Internal note" };

/** Approve or return a submitted entry. Both forms work without JavaScript. */
export function TriageForms({ entryId, version }: { entryId: string; version?: string }) {
  const [approveState, approve] = useActionState(approveEntryAction.bind(null, entryId), idleState);
  const [returnState, sendBack] = useActionState(returnEntryAction.bind(null, entryId), idleState);
  const rv = returnState.values ?? {};
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        action={approve}
        className="flex flex-col gap-4 rounded border border-line bg-surface p-6"
      >
        <h3 className="font-display text-xl font-semibold">Approve for judging</h3>
        <FormMessage state={approveState} labels={LABELS} idPrefix="approve-" />
        {version && <input type="hidden" name="version" value={version} />}
        <p>The entry is complete and in the right category. The nominator is emailed.</p>
        <TextArea
          id="approve-note"
          name="note"
          label="Internal note (optional)"
          hint="Only admins see this."
          rows={3}
          maxLength={500}
          defaultValue={approveState.values?.note ?? ""}
          errors={approveState.fieldErrors?.note}
        />
        <div>
          <SubmitButton pendingLabel="Approving…">Approve the entry</SubmitButton>
        </div>
      </form>
      <form
        action={sendBack}
        className="flex flex-col gap-4 rounded border border-line bg-surface p-6"
      >
        <h3 className="font-display text-xl font-semibold">Return to the nominator</h3>
        <FormMessage state={returnState} labels={LABELS} />
        {version && <input type="hidden" name="version" value={version} />}
        <RadioGroup
          name="reason"
          legend="Reason"
          defaultValue={rv.reason}
          errors={returnState.fieldErrors?.reason}
          options={[
            {
              value: "INCOMPLETE",
              label: "Incomplete",
              description: "Something required is missing or unclear.",
            },
            {
              value: "WRONG_CATEGORY",
              label: "Wrong category",
              description: "The nominator may move it to another category.",
            },
            { value: "OTHER", label: "Other" },
          ]}
        />
        <TextArea
          id="message"
          name="message"
          label="Message to the nominator"
          hint="Shown to the nominator and emailed to them. Say exactly what to change."
          rows={5}
          maxLength={1000}
          defaultValue={rv.message ?? ""}
          errors={returnState.fieldErrors?.message}
        />
        <div>
          <SubmitButton pendingLabel="Returning…">Return the entry</SubmitButton>
        </div>
      </form>
    </div>
  );
}
