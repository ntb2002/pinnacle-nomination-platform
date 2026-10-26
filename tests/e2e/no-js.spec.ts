import { expect, test, type Browser, type Page } from "@playwright/test";
import { signInAs } from "./support/auth";
import { e2eDb } from "./support/db";

/** A signed-in page with JavaScript disabled (forms post as plain HTML). */
async function noJsPage(browser: Browser, email: string): Promise<Page> {
  const setup = await browser.newContext();
  await signInAs(await setup.newPage(), email);
  const state = await setup.storageState();
  await setup.close();
  const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: state });
  return ctx.newPage();
}

// Regression: with JavaScript off, a form on an [id] page that comes back with errors
// used to hang the request and pin a CPU core (bound useActionState actions).
test.describe("forms without JavaScript", () => {
  test.describe.configure({ timeout: 20_000 });

  test("an entry form error comes back as a page", async ({ browser }) => {
    const { rows } = await e2eDb().query(
      `SELECT e.id, u.email FROM entry e JOIN "user" u ON u.id = e.nominator_id
       WHERE e.status = 'DRAFT' AND u.email LIKE 'nominator%' ORDER BY u.email DESC LIMIT 1`,
    );
    const page = await noJsPage(browser, rows[0].email);
    await page.goto(`/entries/${rows[0].id}/edit`);
    await page.getByLabel("LinkedIn profile (optional)").fill("not a url");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Check the highlighted fields.")).toBeVisible({ timeout: 5000 });
    await page.context().close();
  });

  test("a triage return error comes back as a page", async ({ browser }) => {
    const { rows } = await e2eDb().query(`SELECT id FROM entry WHERE status = 'SUBMITTED' LIMIT 1`);
    const page = await noJsPage(browser, "admin@example.org");
    await page.goto(`/admin/entries/${rows[0].id}`);
    await page.getByRole("button", { name: "Return the entry" }).click();
    await expect(page.locator("#reason-error")).toHaveText(
      "Choose why the entry is being returned",
      {
        timeout: 5000,
      },
    );
    await page.context().close();
  });

  test("an admin recusal error is visible", async ({ browser }) => {
    const { rows } = await e2eDb().query(
      `SELECT id FROM "user" WHERE email = 'judge3@example.org'`,
    );
    const page = await noJsPage(browser, "admin@example.org");
    await page.goto(`/admin/judges/${rows[0].id}`);
    await page.locator("summary", { hasText: "Record a recusal" }).first().click();
    await page.getByRole("button", { name: "Record the recusal" }).first().click();
    await expect(page.getByText("Give a reason of at least 10 characters").first()).toBeVisible({
      timeout: 5000,
    });
    await page.context().close();
  });
});
