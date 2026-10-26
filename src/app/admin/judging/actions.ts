"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { isUuid } from "@/lib/ids";
import { toActionState } from "@/server/action-errors";
import { requireRole } from "@/server/auth/session";
import { clientIp } from "@/server/request";
import { announceFinalists, selectFinalists } from "@/server/services/finalists";
import { closeRoundOne, openRoundOne, reopenRoundOne } from "@/server/services/rounds";

/** Open round one, close it, reopen it, or announce finalists (`step` says which). */
export async function roundStepAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const step = String(form.get("step") ?? "");
  try {
    const ip = await clientIp();
    if (step === "open") await openRoundOne(actor, { confirm: form.get("confirm") === "on" }, ip);
    else if (step === "close") await closeRoundOne(actor, ip);
    else if (step === "reopen")
      await reopenRoundOne(actor, { reason: String(form.get("reason") ?? "") }, ip);
    else if (step === "announce") await announceFinalists(actor, ip);
    else return { status: "error", message: "Choose a step." };
  } catch (err) {
    return { ...toActionState(err), values: { reason: String(form.get("reason") ?? "") } };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/judging?done=${step}`);
}

export async function selectFinalistsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const categoryId = String(form.get("categoryId") ?? "");
  const entryIds = form.getAll("entryId").map(String);
  const values = { reason: String(form.get("reason") ?? ""), entryIds: entryIds.join(",") };
  try {
    await selectFinalists(
      actor,
      categoryId,
      { count: form.get("count"), entryIds, reason: values.reason },
      await clientIp(),
    );
  } catch (err) {
    return { ...toActionState(err), values };
  }
  revalidatePath("/admin/judging", "layout");
  redirect(isUuid(categoryId) ? `/admin/judging/${categoryId}?done=selected` : "/admin/judging");
}
