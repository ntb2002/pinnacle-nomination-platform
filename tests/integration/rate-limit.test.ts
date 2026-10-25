import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import { consume } from "@/server/rate-limit";
import { resetTables } from "../support/db";

beforeEach(resetTables);
afterAll(closeDb);

const rule = { name: "test", limit: 5, windowSeconds: 900 };
const at = (iso: string) => new Date(iso);

describe("consume (sliding window)", () => {
  it("allows the limit and refuses the next request", async () => {
    for (let i = 0; i < 5; i++)
      expect(await consume(rule, "a", at("2027-01-01T10:01:00Z"))).toBe(true);
    expect(await consume(rule, "a", at("2027-01-01T10:02:00Z"))).toBe(false);
  });

  it("does not reset at a window boundary", async () => {
    for (let i = 0; i < 5; i++) await consume(rule, "b", at("2027-01-01T10:14:50Z"));
    // Seconds later, in the next fixed window: the previous five still count.
    expect(await consume(rule, "b", at("2027-01-01T10:15:05Z"))).toBe(false);
  });

  it("frees capacity as the previous window ages out", async () => {
    for (let i = 0; i < 5; i++) await consume(rule, "c", at("2027-01-01T10:00:10Z"));
    expect(await consume(rule, "c", at("2027-01-01T10:29:00Z"))).toBe(true);
  });

  it("keeps identifiers separate", async () => {
    for (let i = 0; i < 5; i++) await consume(rule, "d", at("2027-01-01T10:01:00Z"));
    expect(await consume(rule, "e", at("2027-01-01T10:01:00Z"))).toBe(true);
  });
});
