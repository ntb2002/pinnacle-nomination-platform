import { toNextJsHandler } from "better-auth/next-js";
import { env } from "@/lib/env";
import { getAuth } from "@/server/auth/auth";

/**
 * Better Auth's HTTP API, allow-listed. Only magic-link verification is reachable over
 * HTTP; sign-in requests and sign-out go through rate-limited server actions instead,
 * so no other Better Auth endpoint (sign-up, user updates, …) is exposed.
 *
 * Verify is only accepted when submitted from our own confirmation page:
 * - a cross-site request is refused (Sec-Fetch-Site other than same-origin, or, for
 *   browsers that do not send it, a Referer from another origin or none), which blocks
 *   login CSRF via a link that signs the victim into an attacker's account;
 * - callbackURL is required, so verify never answers with the raw session token as JSON.
 */
const VERIFY_PATH = "/api/auth/magic-link/verify";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== VERIFY_PATH) return new Response("Not found", { status: 404 });
  if (!isSameOriginRequest(request)) {
    return Response.redirect(new URL("/sign-in?error=link", env().APP_URL), 303);
  }
  if (!url.searchParams.get("callbackURL")) return new Response("Bad request", { status: 400 });
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST() {
  return new Response("Not found", { status: 404 });
}

function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  // Referrer-Policy strict-origin-when-cross-origin always sends our origin same-site.
  const referer = request.headers.get("referer");
  return (
    !!referer && URL.canParse(referer) && new URL(referer).origin === new URL(env().APP_URL).origin
  );
}
