import { inArray } from "drizzle-orm";
import type { Database } from "@/server/db";
import { CATEGORIES } from "@/lib/program-defaults";
import {
  entry,
  entryOutcome,
  entryReference,
  entryStatusEvent,
  judgeAssignment,
  judgeProfile,
  payment,
  user,
} from "@/server/db/schema";
import { stableId } from "./ids";
import { categoryIdsBySlug } from "./program";
import { ADMIN, JUDGES, NOMINATORS, NOMINEES } from "./people";
import { narrativeFor, OUTCOME_TEMPLATES } from "./text";

type Status = "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED";
interface SeedEvent {
  key: string;
  fromStatus: Status;
  toStatus: Status;
  actorId: string;
  returnReason?: "INCOMPLETE" | "WRONG_CATEGORY";
  note?: string;
}
const relationships = ["SELF", "PEER", "STAFF"] as const;

/** 30 entries: 16 approved, 6 submitted, 3 returned, 5 drafts, spread across categories. */
function statusFor(i: number): Status {
  if (i < 16) return "APPROVED";
  if (i < 22) return "SUBMITTED";
  if (i < 25) return "RETURNED";
  return "DRAFT";
}

async function seedUsers(db: Database) {
  const rows = [
    { ...ADMIN, role: "ADMIN" as const },
    ...JUDGES.map((j) => ({ email: j.email, name: j.name, role: "JUDGE" as const })),
    ...NOMINATORS.map((n) => ({ ...n, role: "NOMINATOR" as const })),
  ];
  await db
    .insert(user)
    .values(rows.map((r) => ({ id: stableId(`user:${r.email}`), ...r, emailVerified: true })))
    .onConflictDoNothing({ target: user.email });
  const found = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      inArray(
        user.email,
        rows.map((r) => r.email),
      ),
    );
  return new Map(found.map((u) => [u.email, u.id]));
}

export async function seedDemo(db: Database, cycleId: string) {
  const ids = await seedUsers(db);
  const idOf = (email: string) => {
    const id = ids.get(email);
    if (!id) throw new Error(`seed: user ${email} missing`);
    return id;
  };
  const adminId = idOf(ADMIN.email);
  const categories = await categoryIdsBySlug(db, cycleId);
  const catAt = (i: number) => categories.get(CATEGORIES[i % CATEGORIES.length]!.slug)!;

  await db
    .insert(judgeProfile)
    .values(
      JUDGES.map((j, i) => ({
        userId: idOf(j.email),
        displayName: j.name,
        title: j.title,
        organization: j.organization,
        bio: j.bio,
        isPublic: !("isPublic" in j) || j.isPublic !== false,
        sortOrder: i + 1,
      })),
    )
    .onConflictDoNothing();

  // Each category gets two judges per round; each judge covers three categories.
  const assignments = CATEGORIES.flatMap((_, ci) =>
    [ci % JUDGES.length, (ci + 3) % JUDGES.length].flatMap((ji) =>
      [1, 2].map((round) => ({
        id: stableId(`assign:${ci}:${ji}:${round}`),
        judgeId: idOf(JUDGES[ji]!.email),
        categoryId: catAt(ci).id,
        round,
      })),
    ),
  );
  await db.insert(judgeAssignment).values(assignments).onConflictDoNothing();

  for (const [i, [name, title, company]] of NOMINEES.entries()) {
    const status = statusFor(i);
    const cat = catAt(i);
    const nominatorId = idOf(NOMINATORS[i % NOMINATORS.length]!.email);
    const entryId = stableId(`entry:${i}`);
    const submittedAt = status === "DRAFT" ? null : new Date(Date.UTC(2027, 1, 1 + i));
    const isDraftPartial = status === "DRAFT" && i % 2 === 1;
    await db
      .insert(entry)
      .values({
        id: entryId,
        cycleId,
        categoryId: cat.id,
        nominatorId,
        relationship: relationships[i % 3]!,
        nomineeName: name,
        nomineeTitle: title,
        nomineeCompany: company,
        nomineeEmail: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
        nomineeLinkedinUrl: null,
        narrative: isDraftPartial ? null : narrativeFor(name, company, cat.name),
        status,
        submittedAt,
      })
      .onConflictDoNothing();

    const outcomeCount = isDraftPartial ? 0 : 2 + (i % 2);
    const outcomes = Array.from({ length: outcomeCount }, (_, k) => ({
      id: stableId(`outcome:${i}:${k}`),
      entryId,
      position: k + 1,
      ...OUTCOME_TEMPLATES[(i + k) % OUTCOME_TEMPLATES.length]!,
    }));
    if (outcomes.length) await db.insert(entryOutcome).values(outcomes).onConflictDoNothing();

    const refCount = isDraftPartial ? 0 : 1 + (i % 2);
    const refs = Array.from({ length: refCount }, (_, k) => ({
      id: stableId(`reference:${i}:${k}`),
      entryId,
      position: k + 1,
      name: k === 0 ? "Morgan Ellis" : "Jesse Park",
      title: k === 0 ? "VP, Partnerships" : "Creator",
      organization: k === 0 ? "Example Brand Co." : "Independent",
      email: `reference${i}-${k}@example.org`,
      phone: `+1 315 555 01${String(i).padStart(2, "0")}`,
      relationship: k === 0 ? "Brand partner for three years" : "Creator in the partner program",
    }));
    if (refs.length) await db.insert(entryReference).values(refs).onConflictDoNothing();

    if (status === "DRAFT") continue;
    await db
      .insert(payment)
      .values({
        id: stableId(`payment:${i}`),
        entryId,
        kind: "ENTRY_FEE",
        tier: i % 3 === 2 ? "REGULAR" : "EARLY",
        amountCents: i % 3 === 2 ? 65_000 : 50_000,
        status: "PAID",
        provider: "mock",
        providerSessionId: `seed_cs_${i}`,
        createdById: nominatorId,
        paidAt: submittedAt,
      })
      .onConflictDoNothing();

    const events: SeedEvent[] = [
      { key: "submit", fromStatus: "DRAFT", toStatus: "SUBMITTED", actorId: nominatorId },
    ];
    if (status === "APPROVED") {
      events.push({
        key: "approve",
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
        actorId: adminId,
      });
    }
    if (status === "RETURNED") {
      const wrongCategory = i % 2 === 1;
      events.push({
        key: "return",
        fromStatus: "SUBMITTED",
        toStatus: "RETURNED",
        actorId: adminId,
        returnReason: wrongCategory ? "WRONG_CATEGORY" : "INCOMPLETE",
        note: wrongCategory
          ? "This nomination fits Top Strategist better than its current category. Please move it and resubmit."
          : "Please add a data point for the second outcome so judges can verify it.",
      });
    }
    await db
      .insert(entryStatusEvent)
      .values(
        events.map(({ key, ...e }, k) => ({
          id: stableId(`event:${i}:${key}`),
          entryId,
          ...e,
          createdAt: new Date((submittedAt?.getTime() ?? 0) + k * 3_600_000),
        })),
      )
      .onConflictDoNothing();
  }
}
