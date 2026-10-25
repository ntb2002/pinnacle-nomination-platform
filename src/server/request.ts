import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Client IP for rate limiting and audit rows.
 *
 * The leftmost X-Forwarded-For value is whatever the client sent, so it is never
 * trusted. Each trusted proxy in front of the app appends the address it saw; with
 * TRUSTED_PROXY_HOPS = n, the client is the n-th entry from the right. Production
 * must run behind at least one proxy that appends X-Forwarded-For (LAUNCH_READINESS).
 * Invalid values become "unknown".
 */
export function clientIpFrom(h: Headers, hops = env().TRUSTED_PROXY_HOPS): string {
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const candidate = hops > 0 ? chain[chain.length - hops] : undefined;
  return candidate && isIP(candidate) ? candidate : "unknown";
}

/** Rate-limit bucket for an IP: IPv6 addresses are grouped by /64 (one subscriber). */
export function ipBucket(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const groups = expandIpv6(ip);
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : ip;
}

function expandIpv6(ip: string): string[] | null {
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  if (ip.includes(".")) return null; // IPv4-mapped forms: bucket as-is
  const missing = 8 - h.length - t.length;
  if (ip.includes("::") ? missing < 0 : h.length !== 8) return null;
  return [...h, ...Array(ip.includes("::") ? missing : 0).fill("0"), ...t].map((g) =>
    g.toLowerCase(),
  );
}

export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}
