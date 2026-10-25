import "server-only";
import { headers } from "next/headers";

/**
 * Client IP for rate limiting and audit rows. Uses the first X-Forwarded-For hop,
 * so the host's load balancer must overwrite (not append to) that header
 * (LAUNCH_READINESS → hosting). Falls back to "unknown".
 */
export function clientIpFrom(h: Headers): string {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}
