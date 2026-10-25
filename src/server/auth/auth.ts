import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { account, session, user, verification } from "@/server/db/schema";
import { deliverSignInLink } from "./sign-in-link";

export const SESSION_COOKIE_PREFIX = "pinnacle";
export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

function createAuth() {
  const { APP_URL, BETTER_AUTH_SECRET } = env();
  return betterAuth({
    appName: "Pinnacle Awards",
    baseURL: APP_URL,
    secret: BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        // Never accepted from input (input: false); granted by admins or the CLI only.
        role: { type: "string", required: false, input: false, defaultValue: "NOMINATOR" },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    session: { expiresIn: 7 * 24 * 3600, updateAge: 24 * 3600 },
    // Sign-in requests go through our server action, which rate-limits in Postgres;
    // the only Better Auth HTTP route exposed is magic-link verify (src/app/api/auth).
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: SESSION_COOKIE_PREFIX,
      useSecureCookies: APP_URL.startsWith("https://"),
      database: { generateId: () => randomUUID() },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (s) => {
            const [u] = await db
              .select({ role: user.role })
              .from(user)
              .where(eq(user.id, s.userId));
            await audit({
              actor: { id: s.userId, role: u?.role ?? "NOMINATOR" },
              action: "auth.signed_in",
              targetType: "user",
              targetId: s.userId,
              ip: s.ipAddress ?? null,
            });
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => deliverSignInLink(email, url),
      }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { pinnacleAuth?: Auth };

/** The Better Auth instance, created on first use (so `next build` needs no secrets). */
export function getAuth(): Auth {
  globalForAuth.pinnacleAuth ??= createAuth();
  return globalForAuth.pinnacleAuth;
}
