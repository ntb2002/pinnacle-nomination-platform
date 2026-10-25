import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { assertRole } from "@/server/auth/actor";
import { closeDb } from "@/server/db";
import { auditLog, emailOutbox, user } from "@/server/db/schema";
import { ConflictError, ForbiddenError } from "@/server/errors";
import { grantRole, setUserDisabled } from "@/server/services/users";
import { createActor } from "../support/actors";
import { db, resetTables } from "../support/db";

beforeEach(resetTables);
afterAll(closeDb);

describe("role-based authorization in services", () => {
  it("forbids nominators, judges and anonymous callers from admin services", async () => {
    const nominator = await createActor("NOMINATOR");
    const judge = await createActor("JUDGE");
    await expect(grantRole(nominator, "x@example.com", "ADMIN")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(grantRole(judge, "x@example.com", "ADMIN")).rejects.toBeInstanceOf(ForbiddenError);
    expect(() => assertRole(null, "ADMIN")).toThrow(ForbiddenError);
    await expect(setUserDisabled(judge, nominator.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    // No role was changed, nothing was audited.
    const [row] = await db.select().from(user).where(eq(user.email, "x@example.com"));
    expect(row).toBeUndefined();
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("lets an admin grant a role, audits it, and emails the person", async () => {
    const admin = await createActor("ADMIN");
    const target = await createActor("NOMINATOR");
    await grantRole(admin, target.email.toUpperCase(), "JUDGE", "203.0.113.9");
    const [updated] = await db.select().from(user).where(eq(user.id, target.id));
    expect(updated?.role).toBe("JUDGE");
    const [row] = await db.select().from(auditLog).where(eq(auditLog.action, "user.role_changed"));
    expect(row).toMatchObject({
      actorId: admin.id,
      actorRole: "ADMIN",
      targetId: target.id,
      ip: "203.0.113.9",
    });
    expect(row?.metadata).toMatchObject({ from: "NOMINATOR", to: "JUDGE" });
    const mail = await db.select().from(emailOutbox).where(eq(emailOutbox.toAddress, target.email));
    expect(mail).toHaveLength(1);
  });

  it("creates the account when granting a role to someone who has never signed in", async () => {
    const admin = await createActor("ADMIN");
    await grantRole(admin, "new.judge@example.org", "JUDGE");
    const [created] = await db.select().from(user).where(eq(user.email, "new.judge@example.org"));
    expect(created?.role).toBe("JUDGE");
  });

  it("does not let an admin change their own role", async () => {
    const admin = await createActor("ADMIN");
    await expect(grantRole(admin, admin.email, "NOMINATOR")).rejects.toBeInstanceOf(ConflictError);
    await expect(setUserDisabled(admin, admin.id, true)).rejects.toBeInstanceOf(ConflictError);
  });

  it("disables a user and audits it", async () => {
    const admin = await createActor("ADMIN");
    const target = await createActor("JUDGE");
    await setUserDisabled(admin, target.id, true);
    const [row] = await db.select().from(user).where(eq(user.id, target.id));
    expect(row?.disabledAt).toBeInstanceOf(Date);
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "user.disabled"), eq(auditLog.targetId, target.id)));
    expect(audits).toHaveLength(1);
  });
});
