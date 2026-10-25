import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { signInAs } from "./support/auth";
import { e2eDb } from "./support/db";

// Accounts past nominator12 are created at first sign-in, so sign in before inserting.
const NOMINATOR = "nominator13@example.com";
const narrative = Array.from(
  { length: 280 },
  (_, i) => ["clients", "pipeline", "growth"][i % 3],
).join(" ");

/** A complete draft for NOMINATOR, inserted directly (the form itself is covered elsewhere). */
async function completeDraft(nominee: string): Promise<string> {
  const db = e2eDb();
  const { rows } = await db.query(
    `INSERT INTO entry (cycle_id, category_id, nominator_id, relationship, nominee_name,
       nominee_title, nominee_company, nominee_email, narrative)
     SELECT c.cycle_id, c.id, u.id, 'PEER', $2, 'Chief Revenue Officer', 'Example Sales Co.',
       $3, $4
     FROM category c JOIN award_cycle y ON y.id = c.cycle_id AND y.is_active, "user" u
     WHERE c.name = 'Top Sales Leader' AND u.email = $1
     RETURNING id`,
    [NOMINATOR, nominee, `${nominee.toLowerCase().replace(/\W+/g, ".")}@example.com`, narrative],
  );
  const id = rows[0].id as string;
  await db.query(
    `INSERT INTO entry_outcome (entry_id, position, description, data_point) VALUES
       ($1, 1, 'Grew enterprise bookings', '+41% year over year'),
       ($1, 2, 'Shortened the sales cycle', '94 to 61 days')`,
    [id],
  );
  await db.query(
    `INSERT INTO entry_reference (entry_id, position, name, title, organization, email, phone, relationship)
     VALUES ($1, 1, 'Jordan Vale', 'COO', 'Example Partner Inc.', 'jordan.vale@example.org',
       '+1 315 555 0177', 'Customer for four years')`,
    [id],
  );
  return id;
}

async function openCheckout(page: Page, entryId: string) {
  await page.goto(`/entries/${entryId}`);
  await expect(page.getByRole("heading", { name: "Ready to submit" })).toBeVisible();
  await page.getByRole("button", { name: /^Pay \$[\d,]+ and submit$/ }).click();
  await expect(page).toHaveURL(/\/dev\/checkout\/mock_cs_[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pay the entry fee" })).toBeVisible();
}

test.describe("entry fee payment (mock provider)", () => {
  test("pay and submit: the entry is submitted and a receipt is sent", async ({
    page,
    browser,
  }) => {
    await signInAs(page, NOMINATOR);
    const entryId = await completeDraft("Avery Paywell");
    await openCheckout(page, entryId);
    await expect(page.getByText("Test checkout. No money changes hands.")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: /^Pay \$[\d,]+ \(test\)$/ }).click();

    await expect(page).toHaveURL(new RegExp(`/entries/${entryId}\\?checkout=done$`));
    await expect(
      page.getByRole("status").filter({ hasText: "Payment received. Your entry is submitted" }),
    ).toBeFocused();
    await expect(page.getByText("Status: Submitted")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
    await expect(page.getByText(/entry fee \$[\d,]+, paid/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Pay .* and submit/ })).toHaveCount(0);
    await expectNoAxeViolations(page);

    const { rows } = await e2eDb().query(
      `SELECT subject, text_body FROM email_outbox WHERE to_address = $1 AND template = 'payment_receipt'`,
      [NOMINATOR],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe("Receipt: Pinnacle Awards entry for Top Sales Leader");
    expect(rows[0].text_body).toContain("Avery Paywell, Top Sales Leader");

    // The admin payments page lists it.
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await signInAs(adminPage, "admin@example.org", "/admin/payments");
    const row = adminPage.getByRole("row", { name: /Avery Paywell/ });
    await expect(row).toContainText("Paid");
    await expect(row).toContainText(NOMINATOR);
    await expectNoAxeViolations(adminPage);
    await admin.close();
  });

  test("cancel: the entry stays a draft, and cancelling the checkout allows editing", async ({
    page,
  }) => {
    await signInAs(page, NOMINATOR);
    const entryId = await completeDraft("Blair Cancelton");
    await openCheckout(page, entryId);
    await page.getByRole("button", { name: "Cancel and go back" }).click();

    await expect(page).toHaveURL(new RegExp(`/entries/${entryId}\\?checkout=cancelled$`));
    await expect(
      page.getByRole("status").filter({ hasText: "You left checkout without paying" }),
    ).toBeFocused();
    await expect(page.getByText("Status: Draft")).toBeVisible();
    // The session is still open, so editing waits until it is cancelled.
    await expect(page.getByRole("heading", { name: "Checkout in progress" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit the entry" })).toHaveCount(0);
    await page.goto(`/entries/${entryId}/edit`);
    await expect(page).toHaveURL(new RegExp(`/entries/${entryId}$`));
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Cancel the checkout to make changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/entries/${entryId}\\?checkout=ended$`));
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Checkout cancelled. You can edit the entry again." }),
    ).toBeFocused();
    await expect(page.getByRole("heading", { name: "Ready to submit" })).toBeVisible();
    // Payment attempts are records of money: the draft can no longer be deleted.
    await expect(page.getByText("Delete this draft")).toHaveCount(0);
    await page.getByRole("link", { name: "Edit the entry" }).click();
    await expect(page).toHaveURL(new RegExp(`/entries/${entryId}/edit$`));

    // A fresh checkout can be started again.
    await page.goto(`/entries/${entryId}`);
    await page.getByRole("button", { name: /^Pay \$[\d,]+ and submit$/ }).click();
    await expect(page).toHaveURL(/\/dev\/checkout\/mock_cs_/);
  });

  test("other people's checkouts and the webhook are not reachable", async ({
    page,
    browser,
    request,
  }) => {
    await signInAs(page, NOMINATOR);
    const entryId = await completeDraft("Casey Guarded");
    await openCheckout(page, entryId);
    const checkoutUrl = page.url();
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signInAs(otherPage, "nominator16@example.com");
    expect((await otherPage.goto(checkoutUrl))?.status()).toBe(404);
    await other.close();
    // The Stripe endpoint is off while the mock provider is configured.
    expect((await request.post("/api/webhooks/stripe", { data: "{}" })).status()).toBe(404);
  });
});
