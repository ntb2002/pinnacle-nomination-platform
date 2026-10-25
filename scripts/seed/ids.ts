import { createHash } from "node:crypto";

/**
 * A stable UUID derived from a name, so re-running the seed targets the same rows
 * (inserts use ON CONFLICT DO NOTHING). Not for production ids.
 */
export function stableId(name: string): string {
  const h = createHash("sha256").update(`pinnacle-seed:${name}`).digest("hex");
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
