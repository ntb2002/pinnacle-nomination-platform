import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { e2eDb } from "./support/db";

const PAGES = [
  { path: "/", heading: "Recognizing the executives who build the creator economy." },
  { path: "/categories", heading: "Categories" },
  { path: "/fees", heading: "Fees and deadlines" },
  { path: "/methodology", heading: "Judging methodology" },
  { path: "/judges", heading: "Judging panel" },
  { path: "/conflict-of-interest", heading: "Conflict-of-interest policy" },
];

test.describe("public program site", () => {
  for (const p of PAGES) {
    test(`${p.path} renders and is accessible`, async ({ page }) => {
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.heading);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{20,}/);
      await expectNoAxeViolations(page);
    });
  }

  test("every page has a unique title and is reachable from the nav", async ({ page }) => {
    const titles = new Set<string>();
    for (const p of PAGES) {
      await page.goto(p.path);
      titles.add(await page.title());
    }
    expect(titles.size).toBe(PAGES.length);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const name of ["Categories", "Fees and deadlines", "Methodology", "Judges"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
  });

  test("categories lists enabled categories only", async ({ page }) => {
    await e2eDb().query(`UPDATE category SET enabled = false WHERE slug = 'best-use-of-genai'`);
    try {
      await page.goto("/categories");
      await expect(page.getByRole("heading", { name: "CEO of the Year" })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Most Innovative Campaign of the Year" }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "Best Use of GenAI" })).toHaveCount(0);
    } finally {
      await e2eDb().query(`UPDATE category SET enabled = true WHERE slug = 'best-use-of-genai'`);
    }
  });

  test("fees come from the live cycle settings", async ({ page }) => {
    const { rows } = await e2eDb().query(
      `SELECT regular_fee_cents FROM award_cycle WHERE is_active`,
    );
    await e2eDb().query(`UPDATE award_cycle SET regular_fee_cents = 67500 WHERE is_active`);
    try {
      await page.goto("/fees");
      await expect(page.getByRole("row", { name: /Regular/ })).toContainText("$675");
      // The seeded window is open now, in the early tier.
      await expect(page.getByRole("row", { name: /Early/ })).toContainText("Current");
      await expect(
        page.getByText("each entry is billed separately", { exact: false }),
      ).toBeVisible();
    } finally {
      await e2eDb().query(`UPDATE award_cycle SET regular_fee_cents = $1 WHERE is_active`, [
        rows[0].regular_fee_cents,
      ]);
    }
  });

  test("methodology shows the weights stored for each rubric profile", async ({ page }) => {
    await e2eDb().query(
      `UPDATE rubric_profile SET weight_impact = 50, weight_innovation = 20, weight_influence = 15, weight_references = 15 WHERE key = 'initiative'`,
    );
    try {
      await page.goto("/methodology");
      const table = page.getByRole("table", { name: /Initiative and campaign categories/ });
      await expect(table.getByRole("row", { name: /Impact & Results/ })).toContainText("50%");
      const exec = page.getByRole("table", { name: /Individual executive categories/ });
      await expect(exec.getByRole("row", { name: /Impact & Results/ })).toContainText("40%");
    } finally {
      await e2eDb().query(
        `UPDATE rubric_profile SET weight_impact = 40, weight_innovation = 20, weight_influence = 20, weight_references = 20 WHERE key = 'initiative'`,
      );
    }
  });

  test("a judge without a public profile is not listed", async ({ page }) => {
    await page.goto("/judges");
    await expect(page.getByRole("heading", { name: "Leo Brandt" })).toBeVisible();
    await e2eDb().query(
      `UPDATE judge_profile SET is_public = false WHERE user_id = (SELECT id FROM "user" WHERE email = 'judge6@example.org')`,
    );
    try {
      await page.reload();
      await expect(page.getByRole("heading", { name: "Leo Brandt" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Dana Whitfield" })).toBeVisible();
    } finally {
      await e2eDb().query(
        `UPDATE judge_profile SET is_public = true WHERE user_id = (SELECT id FROM "user" WHERE email = 'judge6@example.org')`,
      );
    }
  });
});
