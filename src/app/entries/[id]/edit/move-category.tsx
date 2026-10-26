"use client";

import { useActionState } from "react";
import { Select } from "@/components/form/controls";
import { FormMessage } from "@/components/form/form-message";
import { SubmitButton } from "@/components/form/submit-button";
import { idleState } from "@/lib/action-state";
import { moveCategoryAction } from "../../actions";

/** For an entry returned as "wrong category": choose the category it belongs in. */
export function MoveCategory({
  entryId,
  current,
  options,
}: {
  entryId: string;
  current: string;
  options: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(moveCategoryAction, idleState);
  return (
    <form
      action={action}
      className="mb-10 flex flex-col gap-4 rounded border border-line bg-surface p-6"
    >
      <input type="hidden" name="entryId" value={entryId} />
      <h2 className="font-display text-2xl font-semibold">Move to another category</h2>
      <FormMessage state={state} labels={{ categoryId: "Category" }} />
      <p>This entry is in {current}. The fee you paid carries over.</p>
      <Select
        id="categoryId"
        name="categoryId"
        label="New category"
        defaultValue={state.values?.categoryId ?? ""}
        errors={state.fieldErrors?.categoryId}
        options={[
          { value: "", label: "Choose a category" },
          ...options.map((o) => ({ value: o.id, label: o.name })),
        ]}
      />
      <div>
        <SubmitButton pendingLabel="Moving…">Move the entry</SubmitButton>
      </div>
    </form>
  );
}
