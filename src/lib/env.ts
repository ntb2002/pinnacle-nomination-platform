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
    /** Where supporting files are stored: local disk (dev, single server) or S3-compatible. */
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    /** Local driver: directory outside public/. Must be on a backed-up volume in production. */
    STORAGE_DIR: z.string().min(1).default("./storage"),
    S3_BUCKET: z.string().min(3).optional(),
    S3_REGION: z.string().min(2).optional(),
    /** Only for S3-compatible services (MinIO, Wasabi, …); omit for AWS S3. */
    S3_ENDPOINT: z.url().optional(),
    /**
     * stripe: Stripe hosted Checkout. mock: the built-in checkout simulator (development,
     * CI, demo). Unset means stripe in real production and mock elsewhere.
     * Cross-field rules are in paymentConfigProblems (checked at boot).
     */
    PAYMENTS_PROVIDER: z.enum(["stripe", "mock"]).optional(),
    /** sk_test_… in development and staging; sk_live_… only in real production. */
    STRIPE_SECRET_KEY: z
      .string()
      .regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/, "must be a Stripe secret or restricted key")
      .optional(),
    /** Signing secret of the webhook endpoint (whsec_…), from the Stripe dashboard or `stripe listen`. */
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .regex(/^whsec_[A-Za-z0-9]+$/, "must be a webhook signing secret (whsec_…)")
      .optional(),
    /** "true" shows a banner saying people and entries are fictional (demo deployments). */
    DEMO_MODE: z.enum(["true", "false"]).default("false"),
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
    if (cfg.STORAGE_DRIVER === "s3" && (!cfg.S3_BUCKET || !cfg.S3_REGION)) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_BUCKET"],
        message: "S3_BUCKET and S3_REGION are required when STORAGE_DRIVER=s3",
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

/** The payment provider in use: PAYMENTS_PROVIDER, else stripe in real production, else mock. */
export function paymentsProvider(cfg: Env = env()): "stripe" | "mock" {
  return cfg.PAYMENTS_PROVIDER ?? (isRealProduction(cfg) ? "stripe" : "mock");
}

/**
 * Payment configuration problems, empty when fine. Checked at boot (src/instrumentation.ts)
 * and before any payment is created, so a misconfigured server never takes money:
 * - the mock provider is refused in real production;
 * - stripe needs a secret key and a webhook signing secret;
 * - live keys are refused anywhere but real production;
 * - test keys are refused in real production, except on a demo deployment.
 */
export function paymentConfigProblems(cfg: Env = env()): string[] {
  const problems: string[] = [];
  const provider = paymentsProvider(cfg);
  const real = isRealProduction(cfg);
  if (provider === "mock" && real) {
    problems.push("PAYMENTS_PROVIDER=mock is refused in production: use stripe");
  }
  if (provider === "stripe") {
    if (!cfg.STRIPE_SECRET_KEY) problems.push("STRIPE_SECRET_KEY is required for stripe");
    if (!cfg.STRIPE_WEBHOOK_SECRET) problems.push("STRIPE_WEBHOOK_SECRET is required for stripe");
  }
  // A test key in production would let anyone "pay" with a test card. Allowed only on a
  // demo deployment, which says so on every page (DEMO_MODE).
  if (/^(sk|rk)_test_/.test(cfg.STRIPE_SECRET_KEY ?? "") && real && cfg.DEMO_MODE !== "true") {
    problems.push("STRIPE_SECRET_KEY: test keys are refused in production unless DEMO_MODE=true");
  }
  if (/^(sk|rk)_live_/.test(cfg.STRIPE_SECRET_KEY ?? "") && !real) {
    problems.push("STRIPE_SECRET_KEY: live keys are refused outside production; use a test key");
  }
  return problems;
}
