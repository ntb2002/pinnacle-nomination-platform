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
import { clientIpFrom } from "@/server/request";
import { deliverSignInLink } from "./sign-in-link";

export const SESSION_COOKIE_PREFIX = "pinnacle";
export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

function createAuth() {
  const { APP_URL, BETTER_AUTH_SECRET } = env();
  return betterAuth({
    appName: "Pinnacle Awards",
    baseURL: APP_URL,
    secret: BETTER_AUTH_SECRET,
    // Redirect targets must be on APP_URL. (env.ts refuses BETTER_AUTH_TRUSTED_ORIGINS.)
    trustedOrigins: [APP_URL],
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
      // Explicit: Better Auth otherwise skips origin checks whenever NODE_ENV=test or TEST is set.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      // Better Auth would read the spoofable leftmost X-Forwarded-For; we record IPs ourselves.
      ipAddress: { disableIpTracking: true },
    },
    databaseHooks: {
      session: {
        create: {
          // A link issued before an account was disabled must not produce a session.
          before: async (s) => {
            const [u] = await db
              .select({ disabledAt: user.disabledAt })
              .from(user)
              .where(eq(user.id, s.userId));
            return !u?.disabledAt;
          },
          after: async (s, ctx) => {
            const [u] = await db
              .select({ role: user.role })
              .from(user)
              .where(eq(user.id, s.userId));
            await audit({
              actor: { id: s.userId, role: u?.role ?? "NOMINATOR" },
              action: "auth.signed_in",
              targetType: "user",
              targetId: s.userId,
              ip: ctx?.headers ? clientIpFrom(ctx.headers) : null,
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
