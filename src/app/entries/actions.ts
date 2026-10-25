"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { entryFormToDraft } from "@/lib/entry-form";
import { toActionState } from "@/server/action-errors";
import { requireRole } from "@/server/auth/session";
import { saveDraft } from "@/server/services/entry-drafts";
import { startEntry } from "@/server/services/entries";

export async function startEntryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole("NOMINATOR");
  let id: string;
  try {
    id = await startEntry(actor, {
      categoryId: String(form.get("categoryId") ?? ""),
      relationship: String(form.get("relationship") ?? ""),
    });
  } catch (err) {
    return toActionState(err);
  }
  redirect(`/entries/${id}/edit`);
}

/** Saves the draft. intent=review continues to the review page after saving. */
export async function saveEntryAction(
  entryId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireRole("NOMINATOR");
  const draft = entryFormToDraft(form.entries());
  try {
    await saveDraft(actor, entryId, draft);
  } catch (err) {
    return { ...toActionState(err), values: Object.fromEntries(flatten(draft)) };
  }
  if (form.get("intent") === "review") redirect(`/entries/${entryId}`);
  return { status: "success", message: "Draft saved." };
}

function* flatten(draft: ReturnType<typeof entryFormToDraft>): Generator<[string, string]> {
  for (const [k, v] of Object.entries(draft)) {
    if (typeof v === "string") yield [k, v];
  }
  for (const [i, o] of draft.outcomes.entries()) {
    for (const [k, v] of Object.entries(o)) yield [`outcomes.${i}.${k}`, v];
  }
  for (const [i, r] of draft.references.entries()) {
    for (const [k, v] of Object.entries(r)) yield [`references.${i}.${k}`, v];
  }
}
