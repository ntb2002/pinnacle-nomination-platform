import { describe, expect, it } from "vitest";
import { entryFeeFor, type PricingCycle } from "@/lib/pricing";

const cycle: PricingCycle = {
  nominationsOpenAt: new Date("2027-01-26T14:00:00Z"),
  earlyDeadline: new Date("2027-02-27T05:00:00Z"),
  regularDeadline: new Date("2027-03-27T04:00:00Z"),
  finalDeadline: new Date("2027-04-24T04:00:00Z"),
  earlyFeeCents: 50_000,
  regularFeeCents: 65_000,
  lateFeeCents: 80_000,
};
const at = (iso: string, deltaMs = 0) => new Date(new Date(iso).getTime() + deltaMs);

describe("entryFeeFor", () => {
  it("is not open before nominations open", () => {
    expect(entryFeeFor(cycle, at("2027-01-26T14:00:00Z", -1000))).toEqual({
      open: false,
      reason: "NOT_OPEN",
    });
  });
  it("charges the early fee from the opening instant", () => {
    expect(entryFeeFor(cycle, cycle.nominationsOpenAt)).toMatchObject({
      tier: "EARLY",
      amountCents: 50_000,
    });
  });
  it("switches tiers exactly at each deadline", () => {
    expect(entryFeeFor(cycle, at("2027-02-27T05:00:00Z", -1000))).toMatchObject({ tier: "EARLY" });
    expect(entryFeeFor(cycle, at("2027-02-27T05:00:00Z", 1000))).toMatchObject({
      tier: "REGULAR",
      amountCents: 65_000,
    });
    expect(entryFeeFor(cycle, cycle.earlyDeadline)).toMatchObject({ tier: "REGULAR" });
    expect(entryFeeFor(cycle, at("2027-03-27T04:00:00Z", -1000))).toMatchObject({
      tier: "REGULAR",
    });
    expect(entryFeeFor(cycle, at("2027-03-27T04:00:00Z", 1000))).toMatchObject({
      tier: "LATE",
      amountCents: 80_000,
    });
  });
  it("closes at the final deadline", () => {
    expect(entryFeeFor(cycle, at("2027-04-24T04:00:00Z", -1000))).toMatchObject({ tier: "LATE" });
    expect(entryFeeFor(cycle, cycle.finalDeadline)).toEqual({ open: false, reason: "CLOSED" });
    expect(entryFeeFor(cycle, at("2027-04-24T04:00:00Z", 1000))).toEqual({
      open: false,
      reason: "CLOSED",
    });
  });
});
