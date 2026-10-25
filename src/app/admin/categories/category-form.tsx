"use client";

import { useActionState } from "react";
import { updateCategoryAction } from "@/app/admin/settings/actions";
import { Checkbox, Select, TextArea } from "@/components/form/controls";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";

export interface CategoryFormProps {
  id: string;
  name: string;
  kind: "CORE" | "OPTIONAL";
  description: string;
  enabled: boolean;
  rubricProfileId: string;
  profiles: { id: string; name: string }[];
  locked: boolean;
}

export function CategoryForm(p: CategoryFormProps) {
  const [state, action] = useActionState(updateCategoryAction.bind(null, p.id), idleState);
  const prefix = `cat-${p.id}-`;
  // React resets the form after each action: show what the admin typed after an error.
  const v = {
    description: state.values?.description ?? p.description,
    rubricProfileId: state.values?.rubricProfileId ?? p.rubricProfileId,
    enabled: state.values ? state.values.enabled === "on" : p.enabled,
  };
  return (
    <form
      key={JSON.stringify(state)}
      action={action}
      className="flex flex-col gap-5 rounded border border-line bg-surface p-6"
      noValidate
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold">{p.name}</h2>
        <span className="text-sm text-slate">
          {p.kind === "CORE" ? "Core category" : "Optional category"}
        </span>
      </div>
      <FormMessage
        state={state}
        idPrefix={prefix}
        labels={{ description: "Public description", rubricProfileId: "Rubric" }}
      />
      <TextArea
        id={`${prefix}description`}
        name="description"
        label="Public description"
        rows={3}
        defaultValue={v.description}
        errors={state.fieldErrors?.description}
      />
      <Select
        id={`${prefix}rubricProfileId`}
        name="rubricProfileId"
        label="Rubric"
        hint={p.locked ? "Locked because judging has started." : undefined}
        defaultValue={v.rubricProfileId}
        options={p.profiles.map((r) => ({ value: r.id, label: r.name }))}
        disabled={p.locked}
        errors={state.fieldErrors?.rubricProfileId}
      />
      {p.locked && <input type="hidden" name="rubricProfileId" value={p.rubricProfileId} />}
      {p.kind === "OPTIONAL" ? (
        <Checkbox
          id={`${prefix}enabled`}
          name="enabled"
          label="Offer this category"
          hint="Unchecked categories are hidden from the public site and the nomination form."
          defaultChecked={v.enabled}
        />
      ) : (
        <input type="hidden" name="enabled" value="on" />
      )}
      <div>
        <SubmitButton pendingLabel="Saving…">Save {p.name}</SubmitButton>
      </div>
    </form>
  );
}
