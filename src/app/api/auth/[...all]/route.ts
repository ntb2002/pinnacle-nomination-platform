import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";

/**
 * Better Auth's HTTP API, allow-listed. Only magic-link verification is reachable over
 * HTTP; sign-in requests and sign-out go through rate-limited server actions instead,
 * so no other Better Auth endpoint (sign-up, user updates, …) is exposed.
 */
const ALLOWED_GET = new Set(["/api/auth/magic-link/verify"]);

export async function GET(request: Request) {
  if (!ALLOWED_GET.has(new URL(request.url).pathname))
    return new Response("Not found", { status: 404 });
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST() {
  return new Response("Not found", { status: 404 });
}
