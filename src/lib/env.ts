import { z } from "zod";

/**
 * The only place the app reads process.env (AGENTS.md → Architecture conventions).
 * Every variable is documented in .env.example. Validation runs at server boot
 * (src/instrumentation.ts) and on first use, so a bad config fails fast and loudly.
 *
 * "Local test deployment" = a production build served on a loopback APP_URL (e2e).
 * It may use the dev-only drivers (email outbox; later the mock payment provider).
 * A real production deployment (non-loopback APP_URL) may not.
 */
const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, "must be a postgres:// or postgresql:// connection string");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Public base URL, no trailing slash, e.g. https://pinnacle.example.edu. */
    APP_URL: z
      .url({ protocol: /^https?$/ })
      .refine((v) => !v.endsWith("/"), "must not end with a slash"),
    DATABASE_URL: postgresUrl,
    /** Signs session cookies and tokens. At least 32 random characters. */
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    /** outbox: write mail to the email_outbox table (dev/test). smtp: deliver via SMTP_URL. */
    EMAIL_TRANSPORT: z.enum(["outbox", "smtp"]).default("outbox"),
    /** e.g. smtps://user:pass@smtp.example.edu:465 */
    SMTP_URL: z
      .string()
      .regex(/^smtps?:\/\/.+/, "must be an smtp:// or smtps:// URL")
      .optional(),
    /** Sender, e.g. "Pinnacle Awards <pinnacle@syr.edu>". Required in production (SPF/DMARC). */
    EMAIL_FROM: z.string().min(3).optional(),
    /**
     * Number of proxies in front of the app that append to X-Forwarded-For. The client IP
     * is that many entries from the right. 1 = one load balancer (typical).
     */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    /** Must stay unset: Better Auth would silently trust extra origins from it. */
    BETTER_AUTH_TRUSTED_ORIGINS: z
      .undefined({ error: "must not be set; trusted origin is APP_URL" })
      .optional(),
  })
  .superRefine((cfg, ctx) => {
    if (!URL.canParse(cfg.APP_URL)) return; // already reported by the field check
    const realProduction = cfg.NODE_ENV === "production" && !isLoopback(cfg.APP_URL);
    if (realProduction && !cfg.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https in production" });
    }
    if (realProduction && cfg.EMAIL_TRANSPORT !== "smtp") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "must be smtp in production (the outbox never delivers mail)",
      });
    }
    if (realProduction && !cfg.EMAIL_FROM) {
      ctx.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "is required in production" });
    }
    if (realProduction && cfg.SMTP_URL && !cfg.SMTP_URL.startsWith("smtps://")) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_URL"],
        message:
          "must use smtps:// (implicit TLS) in production so tokens never cross the wire unencrypted",
      });
    }
    if (cfg.EMAIL_TRANSPORT === "smtp" && !cfg.SMTP_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_URL"],
        message: "is required when EMAIL_TRANSPORT=smtp",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

function isLoopback(appUrl: string): boolean {
  const host = new URL(appUrl).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** Validates a raw environment record. Exported for tests; app code calls env(). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      `Invalid environment configuration (see .env.example):\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** True for a real deployment: production build on a non-loopback URL. */
export function isRealProduction(cfg: Env = env()): boolean {
  return cfg.NODE_ENV === "production" && !isLoopback(cfg.APP_URL);
}
