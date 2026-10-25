import { z } from "zod";

/**
 * The only place the app reads process.env (AGENTS.md → Architecture conventions).
 * Every variable is documented in .env.example. Validation runs at server boot
 * (src/instrumentation.ts) and on first use, so a bad config fails fast and loudly.
 */
const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, "must be a postgres:// or postgresql:// connection string");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Public base URL, no trailing slash, e.g. https://pinnacle.example.edu. Used in emails and redirects. */
    APP_URL: z
      .url({ protocol: /^https?$/ })
      .refine((v) => !v.endsWith("/"), "must not end with a slash"),
    DATABASE_URL: postgresUrl,
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === "production" && !cfg.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https in production" });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
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
