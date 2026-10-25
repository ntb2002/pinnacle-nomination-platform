"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { toActionState } from "@/server/action-errors";
import { audit } from "@/server/audit";
import { getAuth } from "@/server/auth/auth";
import { getActor } from "@/server/auth/session";
import { clientIpFrom } from "@/server/request";
import { requestSignIn } from "@/server/services/sign-in";

export async function requestSignInAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const h = await headers();
  try {
    await requestSignIn({
      email: String(form.get("email") ?? ""),
      next: String(form.get("next") ?? "/"),
      ip: clientIpFrom(h),
      headers: h,
    });
    return {
      status: "success",
      message:
        "Check your email. If the address can receive mail, a sign-in link is on its way. It expires in 15 minutes.",
    };
  } catch (err) {
    return toActionState(err);
  }
}

export async function signOutAction(): Promise<void> {
  const h = await headers();
  const actor = await getActor();
  await getAuth().api.signOut({ headers: h });
  if (actor) {
    await audit({
      actor,
      action: "auth.signed_out",
      targetType: "user",
      targetId: actor.id,
      ip: clientIpFrom(h),
    });
  }
  redirect("/");
}
