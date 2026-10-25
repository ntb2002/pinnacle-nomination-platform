/**
 * Builds the per-request Content-Security-Policy. Scripts are allowed only with
 * the request's nonce ('strict-dynamic' lets Next's bootstrap load its chunks).
 * Inline style *attributes* are allowed (style-src-attr) because React may render
 * them; inline <style> elements still need the nonce.
 */
export function buildCsp(nonce: string, opts: { dev: boolean; https: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(opts.dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(opts.dev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Stripe hosted Checkout is reached by redirect after a form post.
    "form-action": ["'self'", "https://checkout.stripe.com"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (opts.https) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
