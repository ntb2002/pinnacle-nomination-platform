import { expect, test, type Browser } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { signInAs } from "./support/auth";
import { e2eDb } from "./support/db";

const ADMIN = "admin@example.org";
const db = () => e2eDb();

async function as(browser: Browser, email: string, path: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInAs(page, email, path);
  return { ctx, page };
}

/** Scores every approved entry outside `categoryId` directly, with distinct means, and saves selections. */
async function scoreOtherCategories(categoryId: string, adminId: string, cycleId: string) {
  const { rows: cats } = await db().query(
    `SELECT id FROM category WHERE cycle_id = $1 AND id <> $2`,
    [cycleId, categoryId],
  );
  for (const c of cats) {
    const { rows: entries } = await db().query(
      `SELECT id FROM entry WHERE category_id = $1 AND status = 'APPROVED' ORDER BY id`,
      [c.id],
    );
    if (entries.length === 0) continue;
    const { rows: judges } = await db().query(
      `SELECT judge_id FROM judge_assignment WHERE category_id = $1 AND round = 1`,
      [c.id],
    );
    for (const [i, e] of entries.entries()) {
      for (const j of judges) {
        const v = Math.max(1, 10 - i);
        await db().query(
          `INSERT INTO conflict_declaration (judge_id, entry_id, has_conflict) VALUES ($1, $2, false) ON CONFLICT DO NOTHING`,
          [j.judge_id, e.id],
        );
        await db().query(
          `INSERT INTO score (judge_id, entry_id, round, impact, innovation, influence, reference_validation, submitted_at)
           VALUES ($1, $2, 1, $3, $3, $3, $3, now()) ON CONFLICT DO NOTHING`,
          [j.judge_id, e.id, v],
        );
      }
    }
    const top = entries.slice(0, Math.min(5, entries.length)).map((e) => e.id);
    const ranking = entries.map((e, i) => ({
      entryId: e.id,
      mean: Math.max(1, 10 - i) * 10,
      count: judges.length,
    }));
    await db().query(
      `INSERT INTO finalist_selection (cycle_id, category_id, entry_ids, ranking, selected_by_id) VALUES ($1, $2, $3, $4, $5)`,
      [cycleId, c.id, top, JSON.stringify(ranking), adminId],
    );
  }
}

test("two judges score, the admin closes round one, picks finalists and announces; the nominator sees Finalist", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const {
    rows: [cycle],
  } = await db().query(`SELECT * FROM award_cycle WHERE is_active`);
  const {
    rows: [admin],
  } = await db().query(`SELECT id FROM "user" WHERE email = $1`, [ADMIN]);
  // The category with the fewest approved entries keeps the UI part short.
  const {
    rows: [cat],
  } = await db().query(
    `SELECT c.id, c.name, count(e.id)::int AS n FROM category c JOIN entry e ON e.category_id = c.id AND e.status = 'APPROVED'
     WHERE c.cycle_id = $1 GROUP BY c.id HAVING count(e.id) >= 3 ORDER BY count(e.id), c.sort_order LIMIT 1`,
    [cycle.id],
  );
  const { rows: entries } = await db().query(
    `SELECT e.id, e.nominee_name, u.email FROM entry e JOIN "user" u ON u.id = e.nominator_id
     WHERE e.category_id = $1 AND e.status = 'APPROVED' ORDER BY e.id`,
    [cat.id],
  );
  const { rows: judges } = await db().query(
    `SELECT u.email, u.id FROM judge_assignment a JOIN "user" u ON u.id = a.judge_id WHERE a.category_id = $1 AND a.round = 1 ORDER BY u.email LIMIT 2`,
    [cat.id],
  );
  try {
    const t = Date.now();
    await db().query(
      `UPDATE award_cycle SET nominations_open_at = $2, early_deadline = $3, regular_deadline = $4, final_deadline = $5 WHERE id = $1`,
      [cycle.id, new Date(t - 40e7), new Date(t - 30e7), new Date(t - 20e7), new Date(t - 10e7)],
    );
    await scoreOtherCategories(cat.id, admin.id, cycle.id);
    // In this category, every entry but the first is scored directly; the judges score the first in the UI.
    for (const [i, e] of entries.slice(1).entries()) {
      for (const j of judges) {
        await db().query(
          `INSERT INTO conflict_declaration (judge_id, entry_id, has_conflict) VALUES ($1, $2, false) ON CONFLICT DO NOTHING`,
          [j.id, e.id],
        );
        await db().query(
          `INSERT INTO score (judge_id, entry_id, round, impact, innovation, influence, reference_validation, submitted_at) VALUES ($1, $2, 1, $3, $3, $3, $3, now()) ON CONFLICT DO NOTHING`,
          [j.id, e.id, 6 - Math.min(i, 4)],
        );
      }
    }

    // The admin opens round one, confirming entries still in review.
    const a = await as(browser, ADMIN, "/admin/judging");
    await expectNoAxeViolations(a.page);
    await a.page.getByLabel(/still in review will not be judged/).check();
    await a.page.getByRole("button", { name: "Open round one" }).click();
    await expect(
      a.page.getByRole("status").filter({ hasText: "Round one is open." }),
    ).toBeFocused();

    // Two judges declare no conflict and score the first entry.
    const first = entries[0];
    for (const [k, j] of judges.entries()) {
      const s = await as(browser, j.email, `/judge/categories/${cat.id}?round=1`);
      const card = s.page.locator("main li").filter({ hasText: first.nominee_name });
      if (await card.getByLabel("No conflict").count()) {
        await card.getByLabel("No conflict").check();
        await card.getByRole("button", { name: "Save my answer" }).click();
        await expect(
          s.page.getByRole("status").filter({ hasText: "Your answer is saved." }),
        ).toBeVisible();
      }
      await s.page.goto(`/judge/entries/${first.id}?round=1`);
      for (const label of [
        "Impact & Results",
        "Innovation",
        "Industry Influence",
        "Reference Validation",
      ]) {
        await s.page.getByLabel(new RegExp(`^${label}`)).selectOption(String(10 - k));
      }
      await expect(s.page.getByText(`${(10 - k) * 10}.0 of 100`)).toBeVisible();
      await expectNoAxeViolations(s.page);
      await s.page.getByRole("button", { name: "Submit score" }).click();
      await expect(
        s.page.getByRole("status").filter({ hasText: "Score submitted." }),
      ).toBeFocused();
      await s.ctx.close();
    }

    // Close, choose the default top N, announce.
    await a.page.goto("/admin/judging");
    await a.page.getByRole("button", { name: "Close round one" }).click();
    await expect(
      a.page.getByRole("status").filter({ hasText: "Round one is closed." }),
    ).toBeFocused();
    await a.page.goto(`/admin/judging/${cat.id}?n=3`);
    await expect(a.page.getByRole("row").nth(1)).toContainText(first.nominee_name); // highest mean
    await expectNoAxeViolations(a.page);
    await a.page.getByRole("button", { name: "Save the finalists" }).click();
    await expect(a.page.getByRole("status").filter({ hasText: "Finalists saved." })).toBeFocused();
    await a.page.goto("/admin/judging");
    await a.page.getByRole("button", { name: "Announce finalists" }).click();
    await expect(
      a.page.getByRole("status").filter({ hasText: "Finalists announced." }),
    ).toBeFocused();
    await a.ctx.close();

    // The nominator of the top entry sees Finalist and got the email.
    const n = await as(browser, first.email, "/entries");
    await expect(n.page.getByRole("row", { name: new RegExp(first.nominee_name) })).toContainText(
      "Finalist",
    );
    await expectNoAxeViolations(n.page);
    await n.ctx.close();
    const { rows: mail } = await db().query(
      `SELECT subject FROM email_outbox WHERE to_address = $1 AND template = 'finalist'`,
      [first.email],
    );
    expect(mail.some((m) => m.subject.startsWith(`Finalist: ${first.nominee_name}`))).toBe(true);
  } finally {
    await db().query(`DELETE FROM finalist_selection WHERE cycle_id = $1`, [cycle.id]);
    await db().query(`DELETE FROM score`);
    await db().query(`UPDATE entry SET is_finalist = false WHERE cycle_id = $1`, [cycle.id]);
    await db().query(
      `UPDATE award_cycle SET phase = 'NOMINATION', nominations_open_at = $2, early_deadline = $3, regular_deadline = $4, final_deadline = $5 WHERE id = $1`,
      [
        cycle.id,
        cycle.nominations_open_at,
        cycle.early_deadline,
        cycle.regular_deadline,
        cycle.final_deadline,
      ],
    );
  }
});
