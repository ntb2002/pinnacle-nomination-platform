import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/paths";

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/entries")).toBe("/entries");
    expect(safeNextPath("/admin/entries?status=SUBMITTED")).toBe("/admin/entries?status=SUBMITTED");
    expect(safeNextPath("/a/../entries")).toBe("/entries");
  });

  it("rejects open redirects, including ones that only appear after normalization", () => {
    const payloads = [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/./\\evil.example",
      "/.//evil.example",
      "/%2e//evil.example",
      "/x/..//evil.example",
      "/x/../..//evil.example",
      "/./%2e//evil.example/phish",
      "/%2F%2Fevil.example",
      "/%5Cevil.example",
      "javascript:alert(1)",
      "entries",
      "\n/x",
      "/\t/evil.example",
    ];
    for (const bad of payloads) {
      const out = safeNextPath(bad);
      expect(out, bad).toBe("/");
    }
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("/%0d%0aSet-Cookie:x")).not.toMatch(/[\r\n]/);
  });
});
