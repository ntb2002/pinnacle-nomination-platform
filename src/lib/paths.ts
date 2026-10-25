/**
 * Accepts only same-site relative paths for post-sign-in redirects ("/entries"),
 * never "//evil.example", "https://…" or "/\\evil". Anything else becomes "/".
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "http://pinnacle.invalid");
    if (parsed.origin !== "http://pinnacle.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}
