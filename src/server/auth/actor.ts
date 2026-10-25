import { ForbiddenError } from "@/server/errors";

export type Role = "NOMINATOR" | "JUDGE" | "ADMIN";

/** The signed-in person a request acts as. Built server-side from the session; never from input. */
export interface Actor {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Service-level authorization (defense in depth behind requireRole in routes). */
export function assertRole(actor: Actor | null, ...roles: Role[]): asserts actor is Actor {
  if (!actor) throw new ForbiddenError("not signed in");
  if (!roles.includes(actor.role))
    throw new ForbiddenError(`role ${actor.role} not in ${roles.join(",")}`);
}
