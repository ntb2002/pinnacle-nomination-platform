import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";
import { env } from "@/lib/env";

/** Areas that need a signed-in user. Checked again, authoritatively, in every page/action/service. */
const PROTECTED_PREFIXES = ["/admin", "/judge", "/entries"];

/**
 * Runs before every page request (Next 16 "proxy", Node runtime).
 * - Sets a nonce-based CSP.
 * - Passes the path to server components (x-pathname) for sign-in redirects.
 * - Redirects requests without a session cookie away from protected areas. This is a
 *   UX shortcut only: authorization is enforced by requireUser/requireRole and services.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !getSessionCookie(request, { cookiePrefix: "pinnacle" })) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const { NODE_ENV, APP_URL } = env();
  const csp = buildCsp(nonce, {
    dev: NODE_ENV === "development",
    https: APP_URL.startsWith("https:"),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", `${pathname}${search}`);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Supporting files skip the proxy: uploads so their bodies are not buffered
      // here, downloads so they keep their own sandbox CSP. Both route handlers check
      // origin/session themselves.
      source:
        "/((?!_next/static|_next/image|favicon.ico|api/entries/[^/]+/attachments$|api/attachments/[^/]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
