import { describe, expect, it } from "vitest";
import { nominatorStatus } from "@/lib/entry-status";

describe("nominator status", () => {
  it("shows judging progress for approved entries and the result only after announcement", () => {
    expect(nominatorStatus("APPROVED", "NOMINATION", false).label).toBe("Accepted for judging");
    expect(nominatorStatus("APPROVED", "ROUND1_OPEN", true).label).toBe("In judging");
    expect(nominatorStatus("APPROVED", "ROUND1_CLOSED", true).label).toBe("In judging");
    expect(nominatorStatus("APPROVED", "FINALISTS_ANNOUNCED", true).label).toBe("Finalist");
    expect(nominatorStatus("APPROVED", "FINALISTS_ANNOUNCED", false).label).toBe("Not advanced");
    expect(nominatorStatus("SUBMITTED", "ROUND1_OPEN", false).label).toBe("Submitted");
  });
});
