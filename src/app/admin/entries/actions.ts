"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { toActionState } from "@/server/action-errors";
import { requireRole } from "@/server/auth/session";
import { clientIp } from "@/server/request";
import { approveEntry, returnEntry } from "@/server/services/triage";

const formValues = (form: FormData) =>
  Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

export async function approveEntryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const entryId = String(form.get("entryId") ?? "");
  const actor = await requireRole("ADMIN");
  try {
    await approveEntry(actor, entryId, formValues(form), await clientIp());
  } catch (err) {
    return { ...toActionState(err), values: formValues(form) };
  }
  revalidatePath("/admin/entries", "layout");
  redirect(`/admin/entries/${entryId}?done=approved`);
}

export async function returnEntryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const entryId = String(form.get("entryId") ?? "");
  const actor = await requireRole("ADMIN");
  try {
    await returnEntry(actor, entryId, formValues(form), await clientIp());
  } catch (err) {
    return { ...toActionState(err), values: formValues(form) };
  }
  revalidatePath("/admin/entries", "layout");
  redirect(`/admin/entries/${entryId}?done=returned`);
}
