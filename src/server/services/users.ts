import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { emailSchema } from "@/lib/validation/common";
import { audit } from "@/server/audit";
import { assertRole, type Actor, type Role } from "@/server/auth/actor";
import { db } from "@/server/db";
import { session, user } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { roleGrantedEmail } from "@/server/email/templates";
import { hasJudgedActiveCycle, nominationConflict } from "./judges-admin";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

const ROLE_LABEL: Record<Role, string> = {
  NOMINATOR: "nominator",
  JUDGE: "judge",
  ADMIN: "administrator",
};

/**
 * Admin-only: sets a user's role by email, creating the account if the person has
 * never signed in. Admins cannot change their own role (prevents lock-out).
 */
export async function grantRole(actor: Actor, rawEmail: string, role: Role, ip?: string) {
  assertRole(actor, "ADMIN");
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) throw new ValidationError("Enter a valid email address.");
  const email = parsed.data;
  if (email === actor.email) throw new ConflictError("You cannot change your own role.");

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.email, email));
    let id = existing?.id;
    // Conflict policy: judges may not submit nominations in the cycle they judge.
    if (existing && role === "JUDGE") {
      const blocked = await nominationConflict(tx, existing.id);
      if (blocked) throw new ConflictError(blocked);
    }
    // ...and a judge who has started judging this cycle cannot become a nominator in it.
    if (
      existing?.role === "JUDGE" &&
      role === "NOMINATOR" &&
      (await hasJudgedActiveCycle(tx, existing.id))
    ) {
      throw new ConflictError(
        "This judge has declared on entries in the current cycle, so they cannot become a nominator in it.",
      );
    }
    if (existing) {
      if (existing.role === role) return { id: existing.id, changed: false, from: existing.role };
      await tx.update(user).set({ role }).where(eq(user.id, existing.id));
    } else {
      id = randomUUID();
      await tx.insert(user).values({ id, email, name: "", role, emailVerified: false });
    }
    await audit(
      {
        actor,
        action: "user.role_changed",
        targetType: "user",
        targetId: id,
        metadata: { from: existing?.role ?? null, to: role, created: !existing },
        ip,
      },
      tx,
    );
    return { id: id!, changed: true, from: existing?.role ?? null };
  });

  if (result.changed && role !== "NOMINATOR") {
    await sendEmail({
      to: email,
      template: "role-granted",
      content: roleGrantedEmail(ROLE_LABEL[role], env().APP_URL),
    });
  }
  return result;
}

/** Admin-only: disables or re-enables sign-in for a user (sessions stop working at once). */
export async function setUserDisabled(
  actor: Actor,
  userId: string,
  disabled: boolean,
  ip?: string,
) {
  assertRole(actor, "ADMIN");
  if (userId === actor.id) throw new ConflictError("You cannot disable your own account.");
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(user)
      .set({ disabledAt: disabled ? new Date() : null })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (updated.length === 0) throw new NotFoundError("user");
    // Sign the person out everywhere at once.
    if (disabled) await tx.delete(session).where(eq(session.userId, userId));
    await audit(
      {
        actor,
        action: disabled ? "user.disabled" : "user.enabled",
        targetType: "user",
        targetId: userId,
        ip,
      },
      tx,
    );
  });
}
