"use client";

import { useActionState } from "react";
import { Field } from "@/components/form/field";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { updateSettingsAction } from "./actions";

export interface SettingsValues {
  opensDate: string;
  opensTime: string;
  earlyDate: string;
  regularDate: string;
  finalDate: string;
  judgingOpensDate: string;
  judgingClosesDate: string;
  earlyFee: string;
  regularFee: string;
  lateFee: string;
  finalistFee: string;
}

const LABELS: Record<keyof SettingsValues, string> = {
  opensDate: "Opening date",
  opensTime: "Opening time",
  earlyDate: "Early deadline",
  regularDate: "Regular deadline",
  finalDate: "Final deadline",
  judgingOpensDate: "Judging opens",
  judgingClosesDate: "Judging closes",
  earlyFee: "Early fee",
  regularFee: "Regular fee",
  lateFee: "Late fee",
  finalistFee: "Finalist package fee",
};

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [state, action] = useActionState(updateSettingsAction, idleState);
  const v = { ...initial, ...(state.values as Partial<SettingsValues> | undefined) };
  const err = (k: keyof SettingsValues) => state.fieldErrors?.[k];
  const money = (k: "earlyFee" | "regularFee" | "lateFee" | "finalistFee", hint: string) => (
    <Field
      id={k}
      name={k}
      label={`${LABELS[k]} (US dollars)`}
      hint={hint}
      type="number"
      inputMode="numeric"
      min={1}
      step={1}
      defaultValue={v[k]}
      errors={err(k)}
      required
    />
  );
  return (
    <form action={action} className="flex flex-col gap-10" noValidate key={JSON.stringify(v)}>
      <FormMessage state={state} labels={LABELS} />
      <fieldset className="grid gap-6 sm:grid-cols-2">
        <legend className="mb-4 font-display text-2xl font-semibold">Nomination window</legend>
        <Field
          id="opensDate"
          name="opensDate"
          label={LABELS.opensDate}
          type="date"
          defaultValue={v.opensDate}
          errors={err("opensDate")}
          required
        />
        <Field
          id="opensTime"
          name="opensTime"
          label={`${LABELS.opensTime} (Eastern)`}
          type="time"
          defaultValue={v.opensTime}
          errors={err("opensTime")}
          required
        />
        <Field
          id="earlyDate"
          name="earlyDate"
          label={LABELS.earlyDate}
          hint="Last day to submit at the early fee. Ends 11:59 p.m. Eastern."
          type="date"
          defaultValue={v.earlyDate}
          errors={err("earlyDate")}
          required
        />
        <Field
          id="regularDate"
          name="regularDate"
          label={LABELS.regularDate}
          hint="Last day to submit at the regular fee."
          type="date"
          defaultValue={v.regularDate}
          errors={err("regularDate")}
          required
        />
        <Field
          id="finalDate"
          name="finalDate"
          label={LABELS.finalDate}
          hint="Last day to submit at all. Nominations close after it."
          type="date"
          defaultValue={v.finalDate}
          errors={err("finalDate")}
          required
        />
      </fieldset>
      <fieldset className="grid gap-6 sm:grid-cols-2" aria-describedby="judging-help">
        <legend className="mb-4 font-display text-2xl font-semibold">Round one judging</legend>
        <p id="judging-help" className="sm:col-span-2">
          The published judging window, shown on the public site. Opening and closing round one are
          still done on the Judging page. Leave both blank until the dates are confirmed.
        </p>
        <Field
          id="judgingOpensDate"
          name="judgingOpensDate"
          label={LABELS.judgingOpensDate}
          hint="After the final deadline."
          type="date"
          defaultValue={v.judgingOpensDate}
          errors={err("judgingOpensDate")}
        />
        <Field
          id="judgingClosesDate"
          name="judgingClosesDate"
          label={LABELS.judgingClosesDate}
          hint="Last day of judging. Ends 11:59 p.m. Eastern."
          type="date"
          defaultValue={v.judgingClosesDate}
          errors={err("judgingClosesDate")}
        />
      </fieldset>
      <fieldset className="grid gap-6 sm:grid-cols-2">
        <legend className="mb-4 font-display text-2xl font-semibold">Fees</legend>
        {money("earlyFee", "Charged per entry until the early deadline.")}
        {money("regularFee", "Charged per entry until the regular deadline.")}
        {money("lateFee", "Charged per entry until the final deadline.")}
        {money("finalistFee", "Charged per finalist entry after round one.")}
      </fieldset>
      <div>
        <SubmitButton pendingLabel="Saving…">Save dates and fees</SubmitButton>
      </div>
    </form>
  );
}
