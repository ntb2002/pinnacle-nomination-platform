import "server-only";
import { safeNextPath } from "@/lib/paths";
import { emailSchema } from "@/lib/validation/common";
import { getAuth } from "@/server/auth/auth";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { consume, pruneRateLimits, type RateLimitRule } from "@/server/rate-limit";
import { ipBucket } from "@/server/request";

export const SIGN_IN_PER_EMAIL: RateLimitRule = {
  name: "signin:email",
  limit: 5,
  windowSeconds: 15 * 60,
};
export const SIGN_IN_UNKNOWN_IP: RateLimitRule = {
  name: "signin:ip-unknown",
  limit: 200,
  windowSeconds: 15 * 60,
};
export const SIGN_IN_PER_IP: RateLimitRule = {
  name: "signin:ip",
  limit: 20,
  windowSeconds: 15 * 60,
};

export interface SignInRequest {
  email: string;
  next?: string | null;
  ip: string;
  headers: Headers;
}

/**
 * Emails a sign-in link. Always behaves the same whether or not the account exists
 * (no account enumeration). Rate limited per email and per IP in Postgres.
 */
export async function requestSignIn(req: SignInRequest): Promise<void> {
  const parsed = emailSchema.safeParse(req.email);
  if (!parsed.success) {
    throw new ValidationError("Enter a valid email address.", {
      email: [parsed.error.issues[0]?.message ?? "Enter a valid email address."],
    });
  }
  const email = parsed.data;
  // IP first, so requests refused for the IP do not use up the address's allowance.
  // Requests whose IP cannot be determined share one generous bucket, so a proxy
  // misconfiguration never switches IP limiting off entirely.
  const ipAllowed =
    req.ip === "unknown"
      ? await consume(SIGN_IN_UNKNOWN_IP, "unknown")
      : await consume(SIGN_IN_PER_IP, ipBucket(req.ip));
  if (!ipAllowed) throw new RateLimitedError();
  if (!(await consume(SIGN_IN_PER_EMAIL, email))) throw new RateLimitedError();
  if (Math.random() < 0.01) await pruneRateLimits(new Date(Date.now() - 24 * 3600_000));

  await getAuth().api.signInMagicLink({
    body: {
      email,
      callbackURL: safeNextPath(req.next),
      errorCallbackURL: "/sign-in?error=link",
    },
    headers: req.headers,
  });
}
