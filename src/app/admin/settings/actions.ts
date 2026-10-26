"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { toActionState } from "@/server/action-errors";
import { requireRole } from "@/server/auth/session";
import { clientIp } from "@/server/request";
import {
  updateCategory,
  updateCycleSettings,
  updateRubricWeights,
} from "@/server/services/program-settings";

const formValues = (form: FormData) =>
  Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

export async function updateSettingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  try {
    await updateCycleSettings(actor, formValues(form), await clientIp());
    revalidatePath("/", "layout");
    return { status: "success", message: "Dates and fees saved." };
  } catch (err) {
    return { ...toActionState(err), values: formValues(form) };
  }
}

export async function updateRubricAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const profileId = String(form.get("profileId") ?? "");
  const actor = await requireRole("ADMIN");
  try {
    await updateRubricWeights(actor, profileId, formValues(form), await clientIp());
    revalidatePath("/", "layout");
    return { status: "success", message: "Weights saved." };
  } catch (err) {
    return { ...toActionState(err), values: formValues(form) };
  }
}

export async function updateCategoryAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const categoryId = String(form.get("categoryId") ?? "");
  const actor = await requireRole("ADMIN");
  const values = {
    description: String(form.get("description") ?? ""),
    rubricProfileId: String(form.get("rubricProfileId") ?? ""),
    enabled: form.get("enabled") === "on",
  };
  try {
    await updateCategory(actor, categoryId, values, await clientIp());
    revalidatePath("/", "layout");
    return { status: "success", message: "Category saved." };
  } catch (err) {
    return {
      ...toActionState(err),
      values: { ...values, enabled: values.enabled ? "on" : "" },
    };
  }
}
