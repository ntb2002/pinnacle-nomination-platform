import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

describe("buildCsp", () => {
  it("allows scripts only with the nonce in production", () => {
    const csp = buildCsp("abc", { dev: false, https: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("style-src 'self' 'nonce-abc'");
    expect(csp).not.toMatch(/style-src [^;]*'unsafe-inline'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds unsafe-eval only in development", () => {
    expect(buildCsp("abc", { dev: true, https: false })).toContain("'unsafe-eval'");
    expect(buildCsp("abc", { dev: true, https: false })).toContain(
      "style-src 'self' 'unsafe-inline'",
    );
    expect(buildCsp("abc", { dev: false, https: false })).not.toContain("unsafe-eval");
    expect(buildCsp("abc", { dev: false, https: false })).not.toContain("upgrade-insecure");
  });
});
