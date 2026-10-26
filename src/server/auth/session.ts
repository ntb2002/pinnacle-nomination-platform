import "server-only";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";
import type { Actor, Role } from "./actor";

const ROLES: readonly Role[] = ["NOMINATOR", "JUDGE", "ADMIN"];

/**
 * The signed-in actor for this request, or null. Reads the session and the user row
 * from the database on every request (no cookie cache), so role changes and
 * deactivation take effect immediately. Memoized per request.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result) return null;
  const u = result.user as typeof result.user & { role?: string; disabledAt?: Date | null };
  if (u.disabledAt) return null;
  const role = ROLES.find((r) => r === u.role);
  if (!role) return null;
  return { id: u.id, email: u.email, name: u.name, role };
});

/** Pages, actions and route handlers outside the public site call this (or requireRole). */
export async function requireUser(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    const path = (await headers()).get("x-pathname") ?? "/";
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }
  return actor;
}

/** Signed in with one of `roles`, else 403 (rendered by src/app/forbidden.tsx). */
export async function requireRole(...roles: Role[]): Promise<Actor> {
  const actor = await requireUser();
  if (!roles.includes(actor.role)) forbidden();
  return actor;
}
