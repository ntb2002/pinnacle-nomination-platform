import type { Actor, Role } from "@/server/auth/actor";
import { createUser } from "./factories";

/** A persisted user plus the Actor a service would receive for them. */
export async function createActor(role: Role): Promise<Actor> {
  const u = await createUser(role);
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
