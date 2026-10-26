"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { toActionState } from "@/server/action-errors";
import { requireRole } from "@/server/auth/session";
import { clientIp } from "@/server/request";
import { resendEmail } from "@/server/services/email-admin";

/** Admin: try an undelivered email again (id in a hidden input). */
export async function resendEmailAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  let delivered: boolean;
  try {
    delivered = await resendEmail(actor, String(form.get("emailId") ?? ""), await clientIp());
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/admin/emails");
  redirect(`/admin/emails?done=${delivered ? "sent" : "failed"}`);
}
