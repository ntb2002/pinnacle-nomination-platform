import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/paths";
import { db } from "@/server/db";
import { user, verification } from "@/server/db/schema";
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

/**
 * The email a pending (unexpired, unused) sign-in token belongs to, or null.
 * Better Auth stores magic-link tokens as "magic-link:" + base64url(SHA-256(token)).
 * Shown on the confirmation page so a person can see which account a link signs into
 * (a link someone else sent them would name the other person's address).
 */
export async function pendingSignInEmail(token: string, now = new Date()): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const hash = createHash("sha256").update(token).digest("base64url");
  const [row] = await db
    .select({ value: verification.value })
    .from(verification)
    .where(and(eq(verification.identifier, `magic-link:${hash}`), gt(verification.expiresAt, now)));
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as { email?: unknown };
    return typeof parsed.email === "string" ? parsed.email : null;
  } catch {
    return null;
  }
}
