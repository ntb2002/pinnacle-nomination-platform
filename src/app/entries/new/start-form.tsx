"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form/form-message";
import { RadioGroup } from "@/components/form/radio-group";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { startEntryAction } from "../actions";

export function StartForm({
  categories,
}: {
  categories: { id: string; name: string; description: string }[];
}) {
  const [state, action] = useActionState(startEntryAction, idleState);
  return (
    <form key={JSON.stringify(state)} action={action} className="flex flex-col gap-10" noValidate>
      <FormMessage
        state={state}
        labels={{ categoryId: "Category", relationship: "Relationship" }}
      />
      <RadioGroup
        name="categoryId"
        legend="Which award is this nomination for?"
        errors={state.fieldErrors?.categoryId}
        defaultValue={state.values?.categoryId}
        options={categories.map((c) => ({
          value: c.id,
          label: c.name,
          description: c.description,
        }))}
      />
      <RadioGroup
        name="relationship"
        legend="Who is making this nomination?"
        errors={state.fieldErrors?.relationship}
        defaultValue={state.values?.relationship}
        options={[
          { value: "SELF", label: "I am nominating myself" },
          { value: "PEER", label: "I am nominating someone else" },
          { value: "STAFF", label: "I am CCE staff nominating someone" },
        ]}
      />
      <div>
        <SubmitButton pendingLabel="Starting…">Start the entry</SubmitButton>
      </div>
    </form>
  );
}
