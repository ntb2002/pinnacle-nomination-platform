"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form/form-message";
import { idleState } from "@/lib/action-state";
import { deleteDraftAction } from "../actions";

/** Two-step delete (reveal, then confirm) for an unsubmitted draft. Works without JavaScript. */
export function DeleteDraft({ entryId }: { entryId: string }) {
  const [state, action] = useActionState(deleteDraftAction.bind(null, entryId), idleState);
  return (
    <details className="mt-6">
      <summary className="cursor-pointer font-semibold text-danger underline">
        Delete this draft
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <FormMessage state={state} />
        <p>This removes the draft and everything in it. It cannot be undone.</p>
        <div>
          <button
            type="submit"
            className="rounded border-2 border-danger px-4 py-2 font-semibold text-danger"
          >
            Delete the draft permanently
          </button>
        </div>
      </form>
    </details>
  );
}
