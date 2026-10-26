import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { signInAs } from "./support/auth";
import { e2eDb } from "./support/db";

const JUDGE = "judge1@example.org";
const setPhase = (phase: string) =>
  e2eDb().query(`UPDATE award_cycle SET phase = $1 WHERE is_active`, [phase]);

test("a judge declares a conflict on one entry and no conflict on another; only the second opens", async ({
  page,
  browser,
}) => {
  await signInAs(page, JUDGE, "/judge");
  await expect(page.getByRole("heading", { level: 1, name: "Judging" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page
    .locator("section", { has: page.getByRole("heading", { name: /^Round 1/ }) })
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/\/judge\/categories\/[0-9a-f-]+\?round=1$/);
  await expectNoAxeViolations(page);

  const cards = page.locator("main li").filter({ has: page.getByRole("heading", { level: 2 }) });
  const first = (await cards.nth(0).getByRole("heading", { level: 2 }).textContent())!;
  const second = (await cards.nth(1).getByRole("heading", { level: 2 }).textContent())!;
  const { rows } = await e2eDb().query(
    `SELECT id, nominee_name FROM entry WHERE nominee_name = ANY($1)`,
    [[first, second]],
  );
  const idOf = (name: string) => rows.find((r) => r.nominee_name === name)!.id as string;

  // Only name, title and company before declaring.
  await expect(cards.nth(0)).not.toContainText("Read the entry");
  // Conflict on the first entry.
  const a = cards.filter({ hasText: first });
  await a.getByLabel("I have a conflict (I will be recused)").check();
  await a.getByLabel("If you have a conflict, why").fill("We worked together until last year.");
  await a.getByRole("button", { name: "Save my answer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Conflict recorded." })).toBeFocused();
  const recused = page.locator("section", { has: page.getByRole("heading", { name: "Recused" }) });
  await expect(recused).toContainText(first);
  // No conflict on the second.
  const b = cards.filter({ hasText: second });
  await b.getByLabel("No conflict").check();
  await b.getByRole("button", { name: "Save my answer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your answer is saved." })).toBeFocused();
  await expect(cards.filter({ hasText: second })).toContainText(
    "You can read it when the round opens.",
  );

  try {
    await setPhase("ROUND1_OPEN");
    await page.reload();
    await cards
      .filter({ hasText: second })
      .getByRole("link", { name: /Read the entry/ })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: second })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Narrative" })).toBeVisible();
    // Least privilege on the page itself: no reference contact details.
    await expect(page.locator("main")).not.toContainText("@example.org");
    await expectNoAxeViolations(page);
    // The recused entry does not open, by any URL.
    expect((await page.goto(`/judge/entries/${idOf(first)}?round=1`))?.status()).toBe(404);
  } finally {
    await setPhase("NOMINATION");
  }

  // The admin sees the declarations and coverage.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signInAs(admin, "admin@example.org", "/admin/judges");
  await expect(admin.getByRole("heading", { name: "Coverage" })).toBeVisible();
  await expect(admin.getByText(/fewer than 2 eligible/)).toBeVisible();
  await expectNoAxeViolations(admin);
  await admin.goto(`/admin/entries/${idOf(first)}`);
  const decl = admin.locator("section", {
    has: admin.getByRole("heading", { name: /conflict declarations/ }),
  });
  await expect(decl).toContainText("conflict (recused)");
  await expect(decl).toContainText("We worked together until last year.");
  await adminCtx.close();
});
