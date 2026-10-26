import { describe, expect, it } from "vitest";
import { deadlineDay, formatDeadline, formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import {
  deadlineToDateInput,
  endOfDayDeadline,
  toZonedDateInput,
  zonedToUtc,
} from "@/lib/zoned-time";

describe("deadline display", () => {
  it("shows the Eastern calendar day before an exclusive midnight deadline in EST and EDT", () => {
    expect(formatShortDate(deadlineDay(new Date("2027-02-27T05:00:00Z")))).toBe(
      "February 26, 2027",
    );
    expect(formatShortDate(deadlineDay(new Date("2027-03-27T04:00:00Z")))).toBe("March 26, 2027");
    expect(formatDeadline(new Date("2027-02-27T05:00:00Z"))).toBe(
      "February 26, 2027, 11:59 PM EST",
    );
    expect(formatDeadline(new Date("2027-03-27T04:00:00Z"))).toBe("March 26, 2027, 11:59 PM EDT");
  });
  it("derives the time from the instant instead of assuming midnight", () => {
    expect(formatDeadline(new Date("2027-02-26T21:07:00Z"))).toBe("February 26, 2027, 4:06 PM EST");
  });
});

describe("zoned time conversion", () => {
  it("converts Eastern wall-clock times to UTC across DST", () => {
    expect(zonedToUtc("2027-01-26", "09:00")?.toISOString()).toBe("2027-01-26T14:00:00.000Z");
    expect(zonedToUtc("2027-07-01", "09:00")?.toISOString()).toBe("2027-07-01T13:00:00.000Z");
    expect(zonedToUtc("2027-03-14", "03:30")?.toISOString()).toBe("2027-03-14T07:30:00.000Z");
    expect(zonedToUtc("2027-11-07", "12:00")?.toISOString()).toBe("2027-11-07T17:00:00.000Z");
  });
  it("makes end-of-day deadlines and reads them back as the same date", () => {
    for (const day of [
      "2027-02-26",
      "2027-03-13",
      "2027-03-14",
      "2027-11-06",
      "2027-11-07",
      "2027-12-31",
    ]) {
      const d = endOfDayDeadline(day)!;
      expect(deadlineToDateInput(d), day).toBe(day);
      expect(formatDeadline(d)).toMatch(/11:59 PM E[SD]T$/);
    }
    expect(endOfDayDeadline("2027-02-26")?.toISOString()).toBe("2027-02-27T05:00:00.000Z");
    expect(toZonedDateInput(new Date("2027-01-26T14:00:00Z"))).toBe("2027-01-26");
  });
  it("resolves a wall time in the spring-forward gap to the next valid time", () => {
    // 02:30 on 2027-03-14 does not exist in New York; it reads as 03:30 EDT (07:30Z).
    expect(zonedToUtc("2027-03-14", "02:30")?.toISOString()).toBe("2027-03-14T07:30:00.000Z");
    // 01:30 on 2027-11-07 happens twice; the first (EDT) occurrence is used.
    expect(zonedToUtc("2027-11-07", "01:30")?.toISOString()).toBe("2027-11-07T05:30:00.000Z");
  });

  it("rejects malformed dates", () => {
    expect(zonedToUtc("0099-01-01")).toBeNull();
    expect(zonedToUtc("2101-01-01")).toBeNull();
    expect(zonedToUtc("2027-02-30")).toBeNull();
    expect(zonedToUtc("27-01-01")).toBeNull();
    expect(zonedToUtc("2027-01-01", "25:00")).toBeNull();
    expect(endOfDayDeadline("nope")).toBeNull();
  });
});

describe("formatCents", () => {
  it("formats whole and fractional dollars", () => {
    expect(formatCents(50_000)).toBe("$500");
    expect(formatCents(150_000)).toBe("$1,500");
    expect(formatCents(51_234)).toBe("$512.34");
    expect(formatCents(5)).toBe("$0.05");
  });
});
