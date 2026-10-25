import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";
import { env } from "@/lib/env";

/**
 * Runs before every page request (Next 16 "proxy", Node runtime).
 * Sets a nonce-based CSP. Role gates for /admin and /judge are added in #4 —
 * they are a UX shortcut only; authorization is enforced in each page/action/service.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const { NODE_ENV, APP_URL } = env();
  const csp = buildCsp(nonce, {
    dev: NODE_ENV === "development",
    https: APP_URL.startsWith("https:"),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
