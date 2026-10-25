/**
 * Accepts only same-site relative paths for post-sign-in redirects ("/entries"),
 * never "//evil.example", "https://…", "/\\evil" or dot-segment tricks such as
 * "/.//evil.example" that normalize into a protocol-relative URL. The *output* is
 * checked after normalization. Anything unsafe becomes the fallback.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  // Encoded slashes/backslashes become "//" once something downstream decodes them.
  if (/%(2f|5c)/i.test(value)) return fallback;
  let out: string;
  try {
    const parsed = new URL(value, "http://pinnacle.invalid");
    if (parsed.origin !== "http://pinnacle.invalid") return fallback;
    out = `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
  if (!out.startsWith("/") || out.startsWith("//") || out.includes("\\")) return fallback;
  return out;
}
