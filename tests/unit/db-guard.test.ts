import { describe, expect, it } from "vitest";
import { assertSafeToReset } from "../../scripts/lib/db-guard";

describe("assertSafeToReset", () => {
  it("allows local dev/test/e2e databases", () => {
    for (const db of ["pinnacle_dev", "pinnacle_test", "pinnacle_e2e"]) {
      expect(() => assertSafeToReset(`postgresql://u:p@localhost:5432/${db}`, {})).not.toThrow();
    }
  });

  it("refuses remote hosts, other names, and production", () => {
    expect(() =>
      assertSafeToReset("postgresql://u:p@db.prod.example.edu/pinnacle_dev", {}),
    ).toThrow();
    expect(() => assertSafeToReset("postgresql://u:p@localhost/pinnacle", {})).toThrow();
    expect(() =>
      assertSafeToReset("postgresql://u:p@localhost/pinnacle_dev", { NODE_ENV: "production" }),
    ).toThrow();
  });

  it("allows an explicit override", () => {
    expect(() =>
      assertSafeToReset("postgresql://u:p@db.example.edu/pinnacle", { ALLOW_DB_RESET: "1" }),
    ).not.toThrow();
  });
});
