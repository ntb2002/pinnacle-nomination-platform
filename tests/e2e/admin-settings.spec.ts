import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { signInAs } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe("admin program settings", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin@example.org", "/admin");
  });

  test("changing the regular fee updates the public fees page", async ({ page }) => {
    const { rows } = await e2eDb().query(
      `SELECT regular_fee_cents FROM award_cycle WHERE is_active`,
    );
    try {
      await page.goto("/admin/settings");
      await expect(page.getByRole("heading", { level: 1, name: "Dates and fees" })).toBeVisible();
      await expectNoAxeViolations(page);
      await page.getByLabel("Regular fee (US dollars)").fill("690");
      await page.getByRole("button", { name: "Save dates and fees" }).click();
      await expect(page.getByRole("status")).toContainText("Dates and fees saved.");
      await page.goto("/fees");
      await expect(page.getByRole("row", { name: /Regular/ })).toContainText("$690");
      const audit = await e2eDb().query(
        `SELECT count(*)::int AS n FROM audit_log WHERE action = 'cycle.settings_updated'`,
      );
      expect(audit.rows[0].n).toBeGreaterThan(0);
    } finally {
      await e2eDb().query(`UPDATE award_cycle SET regular_fee_cents = $1 WHERE is_active`, [
        rows[0].regular_fee_cents,
      ]);
    }
  });

  test("shows linked errors for out-of-order deadlines and keeps the typed values", async ({
    page,
  }) => {
    await page.goto("/admin/settings");
    const early = await page.getByLabel("Early deadline").inputValue();
    await page.getByLabel("Regular deadline").fill(early);
    await page.getByLabel("Late fee (US dollars)").fill("0");
    await page.getByRole("button", { name: "Save dates and fees" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Check the highlighted fields." });
    await expect(alert).toBeFocused();
    await expect(
      alert.getByRole("link", {
        name: /Regular deadline: The regular deadline must be after the early deadline/,
      }),
    ).toHaveAttribute("href", "#regularDate");
    await expect(page.getByLabel("Regular deadline")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Regular deadline")).toHaveValue(early);
    await expectNoAxeViolations(page);
  });

  test("rubric weights must total 100 and lock once judging starts", async ({ page }) => {
    await page.goto("/admin/rubrics");
    await expectNoAxeViolations(page);
    const form = page.locator("form").filter({ hasText: "Initiative and campaign categories" });
    await form.getByLabel("Impact & Results (%)").fill("45");
    await expect(form.getByText("Total: 105% (must be 100%)")).toBeVisible();
    await form.getByRole("button", { name: "Save weights" }).click();
    const alert = form.getByRole("alert");
    await expect(alert).toContainText("Check the weights.");
    const totalHref = await alert.getByRole("link", { name: /Total/ }).getAttribute("href");
    await expect(page.locator(totalHref!)).toHaveCount(1);
    await expect(form.getByLabel("Impact & Results (%)")).toHaveAttribute("aria-invalid", "true");
    // Each weight points at the Total line that explains the problem.
    const describedBy = await form
      .getByLabel("Impact & Results (%)")
      .getAttribute("aria-describedby");
    expect(describedBy?.split(" ")).toContain(totalHref!.slice(1));
    await expect(page.locator(totalHref!)).toContainText("The four weights must add up to 100");
    await e2eDb().query(`UPDATE award_cycle SET phase = 'ROUND1_OPEN' WHERE is_active`);
    try {
      await page.reload();
      await expect(page.getByText("Judging has started, so the weights are locked")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save weights" })).toHaveCount(0);
      await expect(form.getByLabel("Impact & Results (%)")).toBeDisabled();
    } finally {
      await e2eDb().query(`UPDATE award_cycle SET phase = 'NOMINATION' WHERE is_active`);
    }
  });

  test("withdrawing an optional category with submitted entries is refused, keeping the typed text", async ({
    page,
  }) => {
    await page.goto("/admin/categories");
    await expectNoAxeViolations(page);
    const form = page.locator("form").filter({ hasText: "Best Use of GenAI" });
    // Seeded entries in this category have been submitted, so withdrawing is refused.
    await form.getByLabel("Offer this category").uncheck();
    await form.getByRole("button", { name: "Save Best Use of GenAI" }).click();
    await expect(form.getByRole("alert")).toContainText("cannot be withdrawn");
    await expect(form.getByLabel("Offer this category")).not.toBeChecked();
    // A too-short description: the summary links to the field, and the typed text survives.
    await form.getByLabel("Public description").fill("Too short");
    await form.getByRole("button", { name: "Save Best Use of GenAI" }).click();
    const link = form.getByRole("alert").getByRole("link", { name: /Public description/ });
    const href = await link.getAttribute("href");
    await expect(page.locator(href!)).toHaveCount(1);
    await link.click();
    await expect(form.getByLabel("Public description")).toBeFocused();
    await expect(form.getByLabel("Public description")).toHaveValue("Too short");
    await expect(
      page.locator("form").filter({ hasText: "CEO of the Year" }).getByLabel("Offer this category"),
    ).toHaveCount(0);
  });

  test("non-admins cannot reach admin settings", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInAs(page, "judge1@example.org");
    for (const path of ["/admin/settings", "/admin/categories", "/admin/rubrics"]) {
      expect((await page.goto(path))?.status(), path).toBe(403);
    }
    await ctx.close();
  });
});
