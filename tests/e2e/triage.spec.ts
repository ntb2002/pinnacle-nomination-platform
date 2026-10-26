import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { signInAs } from "./support/auth";
import { e2eDb } from "./support/db";

const ADMIN = "admin@example.org";

/** A seeded submitted entry and a category its nominator can move it to. */
async function pickEntry() {
  const { rows } = await e2eDb().query(
    `SELECT e.id, e.nominee_name, u.email, u.name AS nominator_name,
       (SELECT c2.id FROM category c2
         WHERE c2.cycle_id = e.cycle_id AND c2.enabled AND c2.id <> e.category_id
           AND NOT EXISTS (SELECT 1 FROM entry x WHERE x.category_id = c2.id
             AND x.nominator_id = e.nominator_id AND lower(x.nominee_email) = lower(e.nominee_email))
         ORDER BY c2.sort_order LIMIT 1) AS target_id
     FROM entry e JOIN "user" u ON u.id = e.nominator_id
     WHERE e.status = 'SUBMITTED' AND u.email LIKE 'nominator%'
     ORDER BY e.submitted_at LIMIT 1`,
  );
  const r = rows[0];
  const { rows: cat } = await e2eDb().query(`SELECT name FROM category WHERE id = $1`, [
    r.target_id,
  ]);
  return {
    id: r.id as string,
    nominee: r.nominee_name as string,
    nominator: r.email as string,
    target: cat[0].name as string,
  };
}

test("wrong-category return → move → resubmit → approve", async ({ browser }) => {
  const e = await pickEntry();
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  const nominatorCtx = await browser.newContext();
  const nominator = await nominatorCtx.newPage();

  // Admin finds it in the queue and returns it.
  await signInAs(admin, ADMIN, "/admin/entries");
  await expect(admin.getByRole("heading", { level: 1, name: "Entries" })).toBeVisible();
  await expectNoAxeViolations(admin);
  await admin.getByRole("link", { name: e.nominee }).first().click();
  await expect(admin).toHaveURL(new RegExp(`/admin/entries/${e.id}$`));
  await expect(admin.getByText("Contact details are hidden.")).toBeVisible();
  await admin.getByRole("link", { name: "Show reference contact details" }).click();
  await expect(admin.getByText(/@example\.org · \+1/).first()).toBeVisible();
  await expectNoAxeViolations(admin);
  await admin.getByLabel("Wrong category").check();
  await admin
    .getByLabel("Message to the nominator")
    .fill("This entry describes strategy work. Please move it.");
  await admin.getByRole("button", { name: "Return the entry" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Entry returned." })).toBeFocused();
  await expect(admin.getByText("Waiting for the nominator to make changes")).toBeVisible();

  // The nominator sees the message, moves the entry and resubmits.
  await signInAs(nominator, e.nominator, "/entries");
  const row = nominator.getByRole("row", { name: new RegExp(e.nominee) });
  await expect(row).toContainText("Returned for changes");
  await expect(row).toContainText("This entry describes strategy work.");
  await row.getByRole("link", { name: "Make the requested changes" }).click();
  await expect(
    nominator.getByRole("heading", { name: /returned this entry: wrong category/ }),
  ).toBeVisible();
  await expectNoAxeViolations(nominator);
  await nominator.getByLabel("New category").selectOption({ label: e.target });
  await nominator.getByRole("button", { name: "Move the entry" }).click();
  await expect(
    nominator.getByRole("status").filter({ hasText: "Category changed." }),
  ).toBeVisible();
  await nominator.goto(`/entries/${e.id}`);
  await expect(nominator.getByRole("heading", { level: 1, name: e.target })).toBeVisible();
  await expect(nominator.getByRole("button", { name: /^Pay / })).toHaveCount(0);
  await nominator.getByRole("button", { name: "Resubmit the entry" }).click();
  await expect(
    nominator.getByRole("status").filter({ hasText: "Entry resubmitted." }),
  ).toBeFocused();
  await expectNoAxeViolations(nominator);

  // The admin sees what changed and approves.
  await admin.goto(`/admin/entries/${e.id}`);
  await expect(
    admin.getByText(/Resubmitted after a return\. Changed: Category \(was .+\)\./),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Approve the entry" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Entry approved." })).toBeFocused();
  const history = admin.locator("section", {
    has: admin.getByRole("heading", { name: "Status history" }),
  });
  await expect(history).toContainText("Needs review → Approved");
  await expect(history).toContainText("(admin)");

  // The nominator sees Approved and a timeline without admin identities.
  await nominator.goto("/entries");
  await expect(nominator.getByRole("row", { name: new RegExp(e.nominee) })).toContainText(
    "Accepted for judging",
  );
  await nominator.goto(`/entries/${e.id}`);
  const timeline = nominator.locator("section", {
    has: nominator.getByRole("heading", { name: "History" }),
  });
  await expect(timeline).toContainText("Returned for changes: Wrong category");
  await expect(timeline).toContainText("Accepted for judging");
  await expect(timeline).not.toContainText("admin");
  await expectNoAxeViolations(nominator);

  const { rows } = await e2eDb().query(
    `SELECT to_address, subject FROM email_outbox WHERE template IN ('entry_status', 'entry_resubmitted') ORDER BY created_at`,
  );
  expect(rows.filter((r) => r.to_address === e.nominator).map((r) => r.subject)).toEqual([
    expect.stringMatching(/^Changes needed/),
    expect.stringMatching(/^Accepted for judging/),
  ]);
  expect(
    rows.some((r) => r.to_address === ADMIN && /^Resubmitted for review/.test(r.subject)),
  ).toBe(true);
  await adminCtx.close();
  await nominatorCtx.close();
});

test("nominators and judges cannot reach triage", async ({ page, browser }) => {
  await signInAs(page, "nominator13@example.com");
  expect((await page.goto("/admin/entries"))?.status()).toBe(403);
  const judgeCtx = await browser.newContext();
  const judge = await judgeCtx.newPage();
  await signInAs(judge, "judge2@example.org");
  expect((await judge.goto("/admin/entries"))?.status()).toBe(403);
  await judgeCtx.close();
});
