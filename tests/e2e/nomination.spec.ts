import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { signInAs } from "./support/auth";
import { e2eDb } from "./support/db";

const words = (n: number) =>
  Array.from({ length: n }, (_, i) => ["growth", "creators", "partners", "results"][i % 4]).join(
    " ",
  );

test.describe("nomination form", () => {
  test("start, save a partial draft, resume, complete and reach review", async ({ page }) => {
    await signInAs(page, "nominator11@example.com", "/entries");
    await page.getByRole("link", { name: "Start a nomination" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Start a nomination" })).toBeVisible();
    await expectNoAxeViolations(page);

    // Missing choices are reported and linked.
    await page.getByRole("button", { name: "Start the entry" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Check the highlighted fields." }),
    ).toBeFocused();

    await page.getByLabel("Top Strategist").check();
    await page.getByLabel("I am nominating someone else").check();
    await page.getByRole("button", { name: "Start the entry" }).click();
    await expect(page).toHaveURL(/\/entries\/[0-9a-f-]+\/edit$/);
    const entryId = page.url().split("/").at(-2)!;
    await expectNoAxeViolations(page);

    await page.getByLabel("Full name").first().fill("Robin Testcase");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    // The saved value stays in the form (React resets uncontrolled fields after an action).
    await expect(page.getByLabel("Full name").first()).toHaveValue("Robin Testcase");
    await page.getByLabel("Job title").first().fill("x".repeat(10));
    await page.getByLabel("Job title").first().press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await expect(page).toHaveURL(/\/edit$/);

    // Leave and come back: the draft is listed and resumes with its data.
    await page.goto("/entries");
    const row = page.getByRole("row", { name: /Robin Testcase/ });
    await expect(row).toContainText("Draft");
    await row.getByRole("link", { name: "Continue editing" }).click();
    await expect(page.getByLabel("Full name").first()).toHaveValue("Robin Testcase");

    // Review with gaps lists what is missing, each linked to its field.
    await page.getByRole("button", { name: "Save and review" }).click();
    await expect(page.getByRole("heading", { name: "Before you can submit" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Narrative: Write at least 250 words/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("link", { name: "Edit the entry" }).click();
    await page.getByLabel("Job title").first().fill("Chief Strategy Officer");
    await page.getByLabel("Company or organization").fill("Quillfeather Partners");
    await page.getByLabel("Email address").first().fill("robin.testcase@example.com");
    await page.getByLabel("Why this person deserves the award").fill(words(300));
    await expect(page.getByText("300 words (250 to 500)")).toBeVisible();
    for (const i of [0, 1]) {
      await page.locator(`[id="outcomes.${i}.description"]`).fill(`Outcome ${i + 1}`);
      await page.locator(`[id="outcomes.${i}.dataPoint"]`).fill(`+${(i + 1) * 10}% year over year`);
    }
    const ref = (k: string) => page.locator(`[id="references.0.${k}"]`);
    await ref("name").fill("Morgan Ellis");
    await ref("title").fill("VP, Partnerships");
    await ref("organization").fill("Example Brand Co.");
    await ref("email").fill("morgan.ellis@example.org");
    await ref("phone").fill("+1 315 555 0142");
    await ref("relationship").fill("Brand partner for three years");
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Save and review" }).click();

    await expect(page).toHaveURL(new RegExp(`/entries/${entryId}$`));
    await expect(page.getByRole("heading", { name: "Ready to submit" })).toBeVisible();
    await expect(page.getByText(/The early fee of \$500 applies/)).toBeVisible();
    await expect(page.getByText("Morgan Ellis")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("a nominator cannot open someone else's entry", async ({ page }) => {
    const { rows } = await e2eDb().query(
      `SELECT e.id FROM entry e JOIN "user" u ON u.id = e.nominator_id WHERE u.email <> 'nominator12@example.com' LIMIT 1`,
    );
    await signInAs(page, "nominator12@example.com");
    for (const path of [
      `/entries/${rows[0].id}`,
      `/entries/${rows[0].id}/edit`,
      "/entries/not-a-uuid",
      "/entries/not-a-uuid/edit",
    ]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
  });

  test("judges cannot start nominations", async ({ page }) => {
    await signInAs(page, "judge2@example.org");
    expect((await page.goto("/entries/new"))?.status()).toBe(403);
  });
});
