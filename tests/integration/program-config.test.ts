import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { formatDayRange } from "@/lib/dates";
import { CYCLE_2027 } from "@/lib/program-defaults";
import { closeDb } from "@/server/db";
import { auditLog, awardCycle } from "@/server/db/schema";
import { ValidationError } from "@/server/errors";
import { updateCycleSettings } from "@/server/services/program-settings";
import { getActiveCycle } from "@/server/services/public-program";
import { createActor } from "../support/actors";
import { db, resetTables } from "../support/db";
import { createProgram } from "../support/factories";

beforeEach(resetTables);
afterAll(closeDb);

// The CCE timeline (docs/open-questions.md): nominations Jan 26 - Mar 6, judging Mar 9-27.
const cce = {
  opensDate: "2027-01-26",
  opensTime: "09:00",
  earlyDate: "2027-02-09",
  regularDate: "2027-02-23",
  finalDate: "2027-03-06",
  judgingOpensDate: "2027-03-09",
  judgingClosesDate: "2027-03-27",
  earlyFee: "500",
  regularFee: "650",
  lateFee: "800",
  finalistFee: "1500",
};

describe("program configuration: the judging window (#6 follow-up)", () => {
  it("stores the CCE timeline exactly as the defaults state it, audited", async () => {
    await createProgram();
    const admin = await createActor("ADMIN");
    await updateCycleSettings(admin, cce);
    const [row] = await db.select().from(awardCycle);
    for (const k of [
      "nominationsOpenAt",
      "earlyDeadline",
      "regularDeadline",
      "finalDeadline",
      "judgingOpensAt",
      "judgingClosesAt",
    ] as const)
      expect(row![k]!.toISOString(), k).toBe(CYCLE_2027[k].toISOString());
    // Intl puts thin spaces around the dash.
    expect(formatDayRange(row!.judgingOpensAt!, row!.judgingClosesAt!)).toMatch(
      /^March 9\s–\s27, 2027$/u,
    );
    const [log] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "cycle.settings_updated"));
    expect(log!.metadata).toMatchObject({
      after: {
        judgingOpensAt: "2027-03-09T05:00:00.000Z",
        judgingClosesAt: "2027-03-28T04:00:00.000Z",
      },
    });
    expect((await getActiveCycle())!.judgingOpensAt).toEqual(CYCLE_2027.judgingOpensAt);
  });

  it("is optional, but needs both dates, after the final deadline, in order", async () => {
    await createProgram();
    const admin = await createActor("ADMIN");
    await updateCycleSettings(admin, { ...cce, judgingOpensDate: "", judgingClosesDate: "" });
    expect((await db.select().from(awardCycle))[0]!.judgingOpensAt).toBeNull();
    const fails = async (patch: Partial<typeof cce>, field: string) => {
      const err = await updateCycleSettings(admin, { ...cce, ...patch }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(Object.keys((err as ValidationError).fieldErrors)).toContain(field);
    };
    await fails({ judgingClosesDate: "" }, "judgingClosesDate");
    await fails({ judgingOpensDate: "" }, "judgingOpensDate");
    await fails({ judgingOpensDate: "2027-03-06" }, "judgingOpensDate"); // final day itself
    await fails({ judgingClosesDate: "2027-03-08" }, "judgingClosesDate");
    await fails({ judgingOpensDate: "2027-02-30" }, "judgingOpensDate");
    // The same day is a one-day window.
    await updateCycleSettings(admin, { ...cce, judgingClosesDate: "2027-03-09" });
  });
});
