import type { NextConfig } from "next";

// Static security headers. The Content-Security-Policy is per-request (nonce)
// and is set in src/proxy.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? // includeSubDomains/preload are a domain-wide commitment for Syracuse IT (LAUNCH_READINESS).
      [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Always render metadata in <head> (no streaming into <body>), so every page has its
  // <title> from the first byte: assistive tech announces it, and axe never sees a gap.
  // Our metadata is static, so blocking on it costs nothing.
  htmlLimitedBots: /.*/,
  reactStrictMode: true,
  // forbidden() → src/app/forbidden.tsx with HTTP 403 (used by requireRole).
  experimental: { authInterrupts: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
