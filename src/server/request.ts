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
  return (candidate && normalizeIp(candidate)) || "unknown";
}

/** Canonical IP from a proxy-written value (strips :port and [..]:port), or null. */
export function normalizeIp(value: string): string | null {
  if (value.length > 64) return null;
  let v = value;
  const bracketed = v.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) v = bracketed[1]!;
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  const kind = isIP(v);
  if (kind === 4) return v;
  if (kind !== 6) return null;
  const canonical = new URL(`http://[${v}]`).hostname.slice(1, -1);
  // IPv4-mapped (::ffff:a.b.c.d) is serialized as ::ffff:hhhh:hhhh: fold back to IPv4.
  const mapped = canonical.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!mapped) return canonical;
  const [hi, lo] = [parseInt(mapped[1]!, 16), parseInt(mapped[2]!, 16)];
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
}

/** Rate-limit bucket for an IP: IPv6 addresses are grouped by /64 (one subscriber). */
export function ipBucket(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const full = expandIpv6(ip);
  return full ? `${full.slice(0, 4).join(":")}::/64` : ip;
}

function expandIpv6(ip: string): string[] | null {
  if (ip.includes(".")) return null;
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  if (!ip.includes("::")) return h.length === 8 ? h : null;
  const missing = 8 - h.length - t.length;
  return missing < 0 ? null : [...h, ...Array<string>(missing).fill("0"), ...t];
}

export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}
