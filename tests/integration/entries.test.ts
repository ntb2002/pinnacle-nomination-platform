import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import { entry } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { saveDraft } from "@/server/services/entry-drafts";
import { getMyEntry, listMyEntries, startEntry } from "@/server/services/entries";
import { createActor } from "../support/actors";
import { db, resetTables } from "../support/db";
import { createCategory, createCycle, createEntry, createProgram } from "../support/factories";

beforeEach(resetTables);
afterAll(closeDb);

const draft = (patch: Record<string, unknown> = {}) => ({
  nomineeName: "Pat Example",
  nomineeEmail: "Pat@Example.com",
  narrative: "Some words",
  outcomes: [{ description: "Grew revenue", dataPoint: "+48%" }],
  references: [],
  ...patch,
});

describe("starting an entry", () => {
  it("creates a draft for a nominator, prefilled for self-nominations", async () => {
    const { category: cat } = await createProgram();
    const me = await createActor("NOMINATOR");
    const id = await startEntry(me, { categoryId: cat.id, relationship: "SELF" });
    const mine = await getMyEntry(me, id);
    expect(mine).toMatchObject({ status: "DRAFT", nomineeEmail: me.email, relationship: "SELF" });
  });

  it("refuses a second self-nomination in the same category", async () => {
    const { category: cat } = await createProgram();
    const me = await createActor("NOMINATOR");
    await startEntry(me, { categoryId: cat.id, relationship: "SELF" });
    await expect(
      startEntry(me, { categoryId: cat.id, relationship: "SELF" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("is refused to judges and admins", async () => {
    const { category: cat } = await createProgram();
    for (const role of ["JUDGE", "ADMIN"] as const) {
      await expect(
        startEntry(await createActor(role), { categoryId: cat.id, relationship: "PEER" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("is refused outside the nomination window and for disabled categories", async () => {
    const { cycle, category: cat } = await createProgram();
    const me = await createActor("NOMINATOR");
    const after = new Date(cycle.finalDeadline.getTime() + 1000);
    await expect(
      startEntry(me, { categoryId: cat.id, relationship: "PEER" }, after),
    ).rejects.toBeInstanceOf(ConflictError);
    const before = new Date(cycle.nominationsOpenAt.getTime() - 1000);
    await expect(
      startEntry(me, { categoryId: cat.id, relationship: "PEER" }, before),
    ).rejects.toBeInstanceOf(ConflictError);
    const off = await createCategory(cycle.id, { kind: "OPTIONAL", enabled: false });
    await expect(
      startEntry(me, { categoryId: off.id, relationship: "PEER" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not accept a category from another cycle", async () => {
    await createProgram();
    const other = await createCycle({ isActive: false });
    const otherCat = await createCategory(other.id);
    const me = await createActor("NOMINATOR");
    await expect(
      startEntry(me, { categoryId: otherCat.id, relationship: "PEER" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ownership and editing", () => {
  it("never lets one nominator read or change another's entry", async () => {
    const { category: cat } = await createProgram();
    const a = await createActor("NOMINATOR");
    const b = await createActor("NOMINATOR");
    const id = await startEntry(a, { categoryId: cat.id, relationship: "PEER" });
    await expect(getMyEntry(b, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveDraft(b, id, draft())).rejects.toBeInstanceOf(NotFoundError);
    expect(await listMyEntries(b)).toEqual([]);
    const [row] = await db.select().from(entry).where(eq(entry.id, id));
    expect(row?.nomineeName).toBeNull();
  });

  it("saves partial drafts, normalizes the nominee email and replaces rows as a set", async () => {
    const { category: cat } = await createProgram();
    const me = await createActor("NOMINATOR");
    const id = await startEntry(me, { categoryId: cat.id, relationship: "PEER" });
    await saveDraft(me, id, draft());
    await saveDraft(
      me,
      id,
      draft({
        outcomes: [
          { description: "A", dataPoint: "1" },
          { description: "B", dataPoint: "2" },
        ],
      }),
    );
    const mine = await getMyEntry(me, id);
    expect(mine.nomineeEmail).toBe("pat@example.com");
    expect(mine.outcomes.map((o) => [o.position, o.description])).toEqual([
      [1, "A"],
      [2, "B"],
    ]);
  });

  it("blocks a second entry for the same nominee in the same category", async () => {
    const { category: cat } = await createProgram();
    const me = await createActor("NOMINATOR");
    const first = await startEntry(me, { categoryId: cat.id, relationship: "PEER" });
    await saveDraft(me, first, draft());
    const second = await startEntry(me, { categoryId: cat.id, relationship: "PEER" });
    const err = await saveDraft(me, second, draft({ nomineeEmail: "pat@example.com" })).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors.nomineeEmail).toBeDefined();
  });

  it("does not let a submitted entry be edited", async () => {
    const { cycle, category: cat } = await createProgram();
    const me = await createActor("NOMINATOR");
    const e = await createEntry({
      cycleId: cycle.id,
      categoryId: cat.id,
      nominatorId: me.id,
      status: "SUBMITTED",
    });
    await expect(saveDraft(me, e.id, draft())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps a self-nomination's nominee email as the nominator's", async () => {
    const { category: cat } = await createProgram();
    const me = await createActor("NOMINATOR");
    const id = await startEntry(me, { categoryId: cat.id, relationship: "SELF" });
    await saveDraft(me, id, draft({ nomineeEmail: "someone.else@example.com" }));
    expect((await getMyEntry(me, id)).nomineeEmail).toBe(me.email);
  });

  it("treats malformed ids as not found", async () => {
    await createProgram();
    const me = await createActor("NOMINATOR");
    await expect(getMyEntry(me, "abc")).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveDraft(me, "abc", draft())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps outcome and reference row ids stable across saves", async () => {
    const { category: cat } = await createProgram();
    const me = await createActor("NOMINATOR");
    const id = await startEntry(me, { categoryId: cat.id, relationship: "PEER" });
    const two = [
      { description: "A", dataPoint: "1" },
      { description: "B", dataPoint: "2" },
    ];
    await saveDraft(me, id, draft({ outcomes: two }));
    const before = (await getMyEntry(me, id)).outcomes.map((o) => o.id);
    await saveDraft(me, id, draft({ outcomes: [{ description: "A2", dataPoint: "1" }, two[1]] }));
    const after = await getMyEntry(me, id);
    expect(after.outcomes.map((o) => o.id)).toEqual(before);
    expect(after.outcomes[0]?.description).toBe("A2");
    await saveDraft(me, id, draft({ outcomes: [two[0]] }));
    expect((await getMyEntry(me, id)).outcomes).toHaveLength(1);
  });

  it("caps lengths even in drafts", async () => {
    const { category: cat } = await createProgram();
    const me = await createActor("NOMINATOR");
    const id = await startEntry(me, { categoryId: cat.id, relationship: "PEER" });
    await expect(saveDraft(me, id, draft({ nomineeName: "x".repeat(121) }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(saveDraft(me, id, draft({ narrative: "x".repeat(5001) }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
