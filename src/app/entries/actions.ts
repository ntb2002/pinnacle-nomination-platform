"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { draftToFormValues, entryFormToDraft } from "@/lib/entry-form";
import { toActionState } from "@/server/action-errors";
import { isUuid } from "@/lib/ids";
import { requireRole } from "@/server/auth/session";
import { ConflictError, NotFoundError } from "@/server/errors";
import { deleteAttachment } from "@/server/services/attachments";
import { cancelCheckout, startCheckout } from "@/server/services/checkout";
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

/** Removes a supporting file, then returns to the edit page with the result. */
export async function removeAttachmentAction(entryId: string, attachmentId: string) {
  const actor = await requireRole("NOMINATOR");
  let result = "removed=1";
  // Redirect to the file's own entry; the bound entryId is only a fallback.
  let target = isUuid(entryId) ? entryId : null;
  try {
    target = await deleteAttachment(actor, attachmentId);
  } catch (err) {
    toActionState(err); // logs unexpected errors, rethrows Next's signals
    result =
      err instanceof NotFoundError
        ? "uploadError=closed"
        : err instanceof ConflictError
          ? "uploadError=checkout"
          : "uploadError=remove_failed";
  }
  if (!target) redirect("/entries");
  revalidatePath(`/entries/${target}`, "layout");
  redirect(`/entries/${target}/edit?${result}#files-message`);
}

/** Starts hosted checkout for a complete draft and sends the nominator to it. */
export async function startCheckoutAction(
  entryId: string,
  _prev: ActionState,
): Promise<ActionState> {
  const actor = await requireRole("NOMINATOR");
  let url: string;
  try {
    url = await startCheckout(actor, entryId);
  } catch (err) {
    return toActionState(err);
  }
  redirect(url);
}

/** Ends the open checkout so the draft can be edited again. */
export async function cancelCheckoutAction(
  entryId: string,
  _prev: ActionState,
): Promise<ActionState> {
  const actor = await requireRole("NOMINATOR");
  try {
    await cancelCheckout(actor, entryId);
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath(`/entries/${entryId}`, "layout");
  return { status: "success", message: "Checkout cancelled. You can edit the entry again." };
}
