import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import { auditLog, awardCycle, category, rubricProfile } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import {
  getAdminProgram,
  updateCategory,
  updateCycleSettings,
  updateRubricWeights,
} from "@/server/services/program-settings";
import { createActor } from "../support/actors";
import { db, resetTables } from "../support/db";
import {
  createCategory,
  createCycle,
  createEntry,
  createProgram,
  createRubricProfile,
} from "../support/factories";

beforeEach(resetTables);
afterAll(closeDb);

const settings = {
  opensDate: "2027-01-26",
  opensTime: "09:00",
  earlyDate: "2027-02-26",
  regularDate: "2027-03-26",
  finalDate: "2027-04-23",
  earlyFee: "500",
  regularFee: "675",
  lateFee: "800",
  finalistFee: "1500",
};

describe("updateCycleSettings", () => {
  it("stores Eastern dates as exclusive UTC deadlines and dollars as cents, with an audit row", async () => {
    const { cycle } = await createProgram();
    const admin = await createActor("ADMIN");
    await updateCycleSettings(admin, settings, "203.0.113.5");
    const [row] = await db.select().from(awardCycle).where(eq(awardCycle.id, cycle.id));
    expect(row?.nominationsOpenAt.toISOString()).toBe("2027-01-26T14:00:00.000Z");
    expect(row?.earlyDeadline.toISOString()).toBe("2027-02-27T05:00:00.000Z");
    expect(row?.regularDeadline.toISOString()).toBe("2027-03-27T04:00:00.000Z");
    expect(row?.regularFeeCents).toBe(67_500);
    const [log] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "cycle.settings_updated"));
    expect(log?.metadata).toMatchObject({ after: { regularFeeCents: 67_500 } });
    expect((log?.metadata as { before: Record<string, unknown> }).before.regularFeeCents).toBe(
      cycle.regularFeeCents,
    );
  });

  it("enforces the deadline order and whole-dollar fees", async () => {
    await createProgram();
    const admin = await createActor("ADMIN");
    const fails = async (patch: Partial<typeof settings>, field: string) => {
      const err = await updateCycleSettings(admin, { ...settings, ...patch }).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(Object.keys((err as ValidationError).fieldErrors)).toContain(field);
    };
    await fails({ regularDate: "2027-02-20" }, "regularDate");
    await fails({ finalDate: "2027-03-26" }, "finalDate");
    await fails({ earlyDate: "2027-01-25" }, "earlyDate");
    await fails({ earlyFee: "499.50" }, "earlyFee");
    await fails({ lateFee: "0" }, "lateFee");
    await fails({ lateFee: "1e3" }, "lateFee");
    await fails({ regularFee: "" }, "regularFee");
    await fails({ opensDate: "2027-02-30" }, "opensDate");
  });

  it("requires fees to escalate by deadline", async () => {
    await createProgram();
    const admin = await createActor("ADMIN");
    const err = await updateCycleSettings(admin, {
      ...settings,
      regularFee: "450",
      lateFee: "400",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys((err as ValidationError).fieldErrors).sort()).toEqual([
      "lateFee",
      "regularFee",
    ]);
  });

  it("freezes the window and entry fees once judging starts, and the finalist fee once finalists are announced", async () => {
    const { cycle } = await createProgram();
    const admin = await createActor("ADMIN");
    await updateCycleSettings(admin, settings);
    await db.update(awardCycle).set({ phase: "ROUND1_OPEN" }).where(eq(awardCycle.id, cycle.id));
    await expect(
      updateCycleSettings(admin, { ...settings, finalDate: "2027-05-01" }),
    ).rejects.toBeInstanceOf(ConflictError);
    // The finalist fee may still change during round one.
    await updateCycleSettings(admin, { ...settings, finalistFee: "1600" });
    await db
      .update(awardCycle)
      .set({ phase: "FINALISTS_ANNOUNCED" })
      .where(eq(awardCycle.id, cycle.id));
    await expect(
      updateCycleSettings(admin, { ...settings, finalistFee: "1700" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not let opening move later than an entry already submitted", async () => {
    const { cycle, category: cat, nominator } = await createProgram();
    const admin = await createActor("ADMIN");
    await updateCycleSettings(admin, settings);
    await createEntry({
      cycleId: cycle.id,
      categoryId: cat.id,
      nominatorId: nominator.id,
      status: "SUBMITTED",
      submittedAt: new Date("2027-02-01T15:00:00Z"),
    });
    const err = await updateCycleSettings(admin, { ...settings, opensDate: "2027-02-05" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors.opensDate).toBeDefined();
    // Extending a deadline during nominations is allowed.
    await updateCycleSettings(admin, { ...settings, finalDate: "2027-05-07" });
  });

  it("is forbidden to non-admins", async () => {
    await createProgram();
    for (const role of ["NOMINATOR", "JUDGE"] as const) {
      await expect(updateCycleSettings(await createActor(role), settings)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe("updateRubricWeights", () => {
  it("accepts integer weights that sum to 100 and audits before/after", async () => {
    const { cycle } = await createProgram();
    const profile = await createRubricProfile(cycle.id);
    const admin = await createActor("ADMIN");
    await updateRubricWeights(admin, profile.id, {
      weightImpact: "50",
      weightInnovation: "20",
      weightInfluence: "15",
      weightReferences: "15",
    });
    const [row] = await db.select().from(rubricProfile).where(eq(rubricProfile.id, profile.id));
    expect(row?.weightImpact).toBe(50);
    const [log] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "rubric.weights_updated"));
    expect(log?.metadata).toEqual({
      before: { weightImpact: 40, weightInnovation: 20, weightInfluence: 20, weightReferences: 20 },
      after: { weightImpact: 50, weightInnovation: 20, weightInfluence: 15, weightReferences: 15 },
    });
  });

  it("rejects weights that do not sum to 100", async () => {
    const { cycle } = await createProgram();
    const profile = await createRubricProfile(cycle.id);
    const admin = await createActor("ADMIN");
    await expect(
      updateRubricWeights(admin, profile.id, {
        weightImpact: "40",
        weightInnovation: "20",
        weightInfluence: "20",
        weightReferences: "10",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      updateRubricWeights(admin, profile.id, {
        weightImpact: "40.5",
        weightInnovation: "19.5",
        weightInfluence: "20",
        weightReferences: "20",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects blank or non-numeric weights", async () => {
    const { cycle } = await createProgram();
    const profile = await createRubricProfile(cycle.id);
    const admin = await createActor("ADMIN");
    for (const bad of ["", "1e1", "-5"]) {
      await expect(
        updateRubricWeights(admin, profile.id, {
          weightImpact: "60",
          weightInnovation: "40",
          weightInfluence: "0",
          weightReferences: bad,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("refuses edits once round one has opened", async () => {
    const { cycle } = await createProgram();
    const profile = await createRubricProfile(cycle.id);
    await db.update(awardCycle).set({ phase: "ROUND1_OPEN" }).where(eq(awardCycle.id, cycle.id));
    const admin = await createActor("ADMIN");
    await expect(
      updateRubricWeights(admin, profile.id, {
        weightImpact: "50",
        weightInnovation: "20",
        weightInfluence: "15",
        weightReferences: "15",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("is forbidden to non-admins", async () => {
    const { cycle } = await createProgram();
    const profile = await createRubricProfile(cycle.id);
    await expect(
      updateRubricWeights(await createActor("JUDGE"), profile.id, {
        weightImpact: "40",
        weightInnovation: "20",
        weightInfluence: "20",
        weightReferences: "20",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("updateCategory", () => {
  const base = (profileId: string) => ({
    description: "A description that is long enough to publish.",
    rubricProfileId: profileId,
    enabled: true,
  });

  it("is forbidden to non-admins and audits description before/after", async () => {
    const { category: cat } = await createProgram();
    const judge = await createActor("JUDGE");
    await expect(updateCategory(judge, cat.id, base(cat.rubricProfileId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(getAdminProgram(judge)).rejects.toBeInstanceOf(ForbiddenError);
    const admin = await createActor("ADMIN");
    await updateCategory(admin, cat.id, base(cat.rubricProfileId));
    const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "category.updated"));
    expect(log?.metadata).toMatchObject({
      before: { description: cat.description },
      after: { description: "A description that is long enough to publish." },
    });
  });

  it("treats a malformed id as not found", async () => {
    await createProgram();
    const admin = await createActor("ADMIN");
    await expect(updateCategory(admin, "not-a-uuid", base("x"))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("never disables a core category", async () => {
    const { cycle } = await createProgram();
    const cat = await createCategory(cycle.id, { kind: "CORE" });
    const admin = await createActor("ADMIN");
    await expect(
      updateCategory(admin, cat.id, { ...base(cat.rubricProfileId), enabled: false }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("withdraws an optional category only while it has no submitted entries", async () => {
    const { cycle, nominator } = await createProgram();
    const opt = await createCategory(cycle.id, { kind: "OPTIONAL" });
    const admin = await createActor("ADMIN");
    await createEntry({
      cycleId: cycle.id,
      categoryId: opt.id,
      nominatorId: nominator.id,
      status: "DRAFT",
    });
    await updateCategory(admin, opt.id, { ...base(opt.rubricProfileId), enabled: false });
    await updateCategory(admin, opt.id, { ...base(opt.rubricProfileId), enabled: true });
    await createEntry({
      cycleId: cycle.id,
      categoryId: opt.id,
      nominatorId: nominator.id,
      status: "SUBMITTED",
    });
    await expect(
      updateCategory(admin, opt.id, { ...base(opt.rubricProfileId), enabled: false }),
    ).rejects.toBeInstanceOf(ConflictError);
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "category.updated"), eq(auditLog.targetId, opt.id)));
    expect(audits).toHaveLength(2);
  });

  it("locks the rubric choice once judging starts", async () => {
    const { cycle, category: cat } = await createProgram();
    const other = await createRubricProfile(cycle.id);
    await db.update(awardCycle).set({ phase: "ROUND1_OPEN" }).where(eq(awardCycle.id, cycle.id));
    const admin = await createActor("ADMIN");
    await expect(updateCategory(admin, cat.id, { ...base(other.id) })).rejects.toBeInstanceOf(
      ConflictError,
    );
    // Descriptions can still be edited.
    await updateCategory(admin, cat.id, {
      ...base(cat.rubricProfileId),
      description: "Updated description for the public site.",
    });
    const [row] = await db.select().from(category).where(eq(category.id, cat.id));
    expect(row?.description).toBe("Updated description for the public site.");
  });

  it("refuses a rubric from another cycle", async () => {
    const { category: cat } = await createProgram();
    const otherCycle = await createCycle({ isActive: false });
    const foreign = await createRubricProfile(otherCycle.id);
    const admin = await createActor("ADMIN");
    await expect(updateCategory(admin, cat.id, base(foreign.id))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
