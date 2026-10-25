import "server-only";
import { safeNextPath } from "@/lib/paths";
import { emailSchema } from "@/lib/validation/common";
import { getAuth } from "@/server/auth/auth";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { consume, type RateLimitRule } from "@/server/rate-limit";

export const SIGN_IN_PER_EMAIL: RateLimitRule = {
  name: "signin:email",
  limit: 5,
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
  const [byEmail, byIp] = [
    await consume(SIGN_IN_PER_EMAIL, email),
    await consume(SIGN_IN_PER_IP, req.ip),
  ];
  if (!byEmail || !byIp) throw new RateLimitedError();

  await getAuth().api.signInMagicLink({
    body: {
      email,
      callbackURL: safeNextPath(req.next),
      errorCallbackURL: "/sign-in?error=link",
    },
    headers: req.headers,
  });
}
