// npm run user:role -- <email> <NOMINATOR|JUDGE|ADMIN>
// Bootstraps the first admin (or fixes a role) from a shell on the server. Creates the
// account if the person has never signed in. Writes an audit row (actor: CLI).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { and, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { emailSchema } from "@/lib/validation/common";
import * as schema from "@/server/db/schema";

const ROLES = ["NOMINATOR", "JUDGE", "ADMIN"] as const;
type Role = (typeof ROLES)[number];

async function main() {
  const [rawEmail, rawRole] = process.argv.slice(2);
  const role = ROLES.find((r) => r === rawRole?.toUpperCase()) as Role | undefined;
  const email = emailSchema.safeParse(rawEmail ?? "");
  if (!email.success || !role) {
    throw new Error("Usage: npm run user:role -- <email> <NOMINATOR|JUDGE|ADMIN>");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool, { schema, casing: "snake_case" });
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.user)
        .where(eq(schema.user.email, email.data));
      const id = existing?.id ?? randomUUID();
      // Conflict policy (as in the app): no judging a cycle you submitted nominations to.
      if (existing && role === "JUDGE") {
        const [submitted] = await tx
          .select({ id: schema.entry.id })
          .from(schema.entry)
          .innerJoin(schema.awardCycle, eq(schema.awardCycle.id, schema.entry.cycleId))
          .where(
            and(
              eq(schema.entry.nominatorId, id),
              ne(schema.entry.status, "DRAFT"),
              eq(schema.awardCycle.isActive, true),
            ),
          )
          .limit(1);
        if (submitted) {
          throw new Error(
            "This person has submitted nominations in the current cycle, so they cannot judge it.",
          );
        }
      }
      if (existing) await tx.update(schema.user).set({ role }).where(eq(schema.user.id, id));
      else
        await tx
          .insert(schema.user)
          .values({ id, email: email.data, name: "", role, emailVerified: false });
      await tx.insert(schema.auditLog).values({
        actorId: null,
        action: "user.role_changed",
        targetType: "user",
        targetId: id,
        metadata: {
          from: existing?.role ?? null,
          to: role,
          created: !existing,
          via: "cli",
          osUser: userInfo().username,
        },
      });
    });
    console.log(`${email.data} is now ${role}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
