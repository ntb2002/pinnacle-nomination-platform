"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { draftToFormValues, entryFormToDraft } from "@/lib/entry-form";
import { toActionState } from "@/server/action-errors";
import { requireRole } from "@/server/auth/session";
import { deleteDraft, saveDraft } from "@/server/services/entry-drafts";
import { startEntry } from "@/server/services/entries";

export async function startEntryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole("NOMINATOR");
  const values = {
    categoryId: String(form.get("categoryId") ?? ""),
    relationship: String(form.get("relationship") ?? ""),
  };
  let id: string;
  try {
    id = await startEntry(actor, values);
  } catch (err) {
    return { ...toActionState(err), values };
  }
  redirect(`/entries/${id}/edit`);
}

/**
 * Saves the draft. intent=review continues to the review page after saving. The saved
 * values are always echoed back, because React resets the form after an action and the
 * page's initial props are from before the save.
 */
export async function saveEntryAction(
  entryId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireRole("NOMINATOR");
  const draft = entryFormToDraft(form.entries());
  const values = draftToFormValues(draft);
  try {
    await saveDraft(actor, entryId, draft);
  } catch (err) {
    return { ...toActionState(err), values };
  }
  revalidatePath(`/entries/${entryId}`, "layout");
  if (form.get("intent") === "review") redirect(`/entries/${entryId}`);
  return { status: "success", message: "Draft saved.", values };
}

export async function deleteDraftAction(entryId: string, _prev: ActionState): Promise<ActionState> {
  const actor = await requireRole("NOMINATOR");
  try {
    await deleteDraft(actor, entryId);
  } catch (err) {
    return toActionState(err);
  }
  redirect("/entries");
}
