import "server-only";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/paths";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { signInEmail } from "@/server/email/templates";

/**
 * Called by Better Auth with its verify URL. We email a link to our own confirmation
 * page instead: link scanners (e.g. Microsoft Safe Links) follow links in email, and
 * following the verify URL directly would spend the single-use token before the person
 * clicks. The confirmation page spends it only when the person presses its button.
 * Disabled accounts get no email (the response to the requester is identical).
 */
export async function deliverSignInLink(email: string, verifyUrl: string): Promise<void> {
  const [existing] = await db
    .select({ disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.email, email));
  if (existing?.disabledAt) return;

  const verify = new URL(verifyUrl);
  const token = verify.searchParams.get("token");
  if (!token) throw new Error("magic link without token");
  const confirm = new URL("/sign-in/confirm", env().APP_URL);
  confirm.searchParams.set("token", token);
  confirm.searchParams.set("next", safeNextPath(verify.searchParams.get("callbackURL")));

  await sendEmail({ to: email, template: "sign-in", content: signInEmail(confirm.toString()) });
}
