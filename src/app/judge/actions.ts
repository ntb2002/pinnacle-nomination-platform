"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { isUuid } from "@/lib/ids";
import { toActionState } from "@/server/action-errors";
import { requireRole } from "@/server/auth/session";
import { clientIp } from "@/server/request";
import { declareConflict } from "@/server/services/conflicts";

/** A judge's declaration for one entry (ids travel as hidden inputs, see AGENTS.md). */
export async function declareAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole("JUDGE");
  const v = {
    conflict: String(form.get("conflict") ?? ""),
    reason: String(form.get("reason") ?? ""),
  };
  try {
    await declareConflict(actor, String(form.get("entryId") ?? ""), v, await clientIp());
  } catch (err) {
    return { ...toActionState(err), values: v };
  }
  revalidatePath("/judge", "layout");
  // The entry's card changes (or moves to "Recused"), so the result is a page notice.
  const categoryId = String(form.get("categoryId") ?? "");
  const round = form.get("round") === "2" ? 2 : 1;
  const declared = v.conflict === "yes" ? "conflict" : "clear";
  redirect(
    isUuid(categoryId)
      ? `/judge/categories/${categoryId}?round=${round}&declared=${declared}`
      : "/judge",
  );
}
