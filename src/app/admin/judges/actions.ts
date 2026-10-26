"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { toActionState } from "@/server/action-errors";
import { requireRole } from "@/server/auth/session";
import { clientIp } from "@/server/request";
import { clearConflict, recordConflict } from "@/server/services/conflicts";
import { setAssignments, setJudgeActive } from "@/server/services/judge-assignments";
import { inviteJudge, updateJudgeProfile } from "@/server/services/judges-admin";

const values = (form: FormData) =>
  Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
const str = (form: FormData, k: string) => String(form.get(k) ?? "");

export async function inviteJudgeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  let id: string;
  try {
    id = await inviteJudge(actor, values(form), await clientIp());
  } catch (err) {
    return { ...toActionState(err), values: values(form) };
  }
  revalidatePath("/admin/judges", "layout");
  redirect(`/admin/judges/${id}?done=invited`);
}

export async function updateProfileAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const v = values(form);
  try {
    await updateJudgeProfile(
      actor,
      str(form, "judgeId"),
      { ...v, isPublic: form.get("isPublic") === "on" },
      await clientIp(),
    );
  } catch (err) {
    return { ...toActionState(err), values: v };
  }
  revalidatePath("/", "layout");
  return { status: "success", message: "Profile saved." };
}

export async function assignmentsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const round = Number(form.get("round")) as 1 | 2;
  try {
    await setAssignments(
      actor,
      str(form, "judgeId"),
      round,
      form.getAll("categoryId").map(String),
      await clientIp(),
    );
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/admin/judges", "layout");
  return { status: "success", message: `Round ${round} categories saved.` };
}

export async function activeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const active = form.get("active") === "true";
  try {
    await setJudgeActive(actor, str(form, "judgeId"), active, await clientIp());
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/", "layout");
  return { status: "success", message: active ? "Judge reactivated." : "Judge deactivated." };
}

export async function conflictAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const clear = form.get("intent") === "clear";
  const args = [
    actor,
    str(form, "judgeId"),
    str(form, "entryId"),
    { reason: str(form, "reason") },
    await clientIp(),
  ] as const;
  try {
    if (clear) await clearConflict(...args);
    else await recordConflict(...args);
  } catch (err) {
    return { ...toActionState(err), values: values(form) };
  }
  revalidatePath("/admin/judges", "layout");
  return { status: "success", message: clear ? "Conflict cleared." : "Recusal recorded." };
}
