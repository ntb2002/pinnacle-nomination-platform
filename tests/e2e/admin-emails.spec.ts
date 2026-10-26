import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { signInAs } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe("admin undelivered emails", () => {
  test("lists a failed email with its error and a resend button", async ({ page }) => {
    const { rows } = await e2eDb().query(
      `INSERT INTO email_outbox (to_address, subject, template, text_body, html_body, status, error, attempts, dedupe_key)
       VALUES ('nominator1@example.com', 'Receipt: Pinnacle Awards entry', 'payment_receipt', 'Thank you', '<p>Thank you</p>', 'FAILED', 'Error EENVELOPE 451', 2, 'e2e:failed-receipt')
       RETURNING id`,
    );
    try {
      await signInAs(page, "admin@example.org", "/admin/emails");
      await expect(
        page.getByRole("heading", { level: 1, name: "Undelivered emails" }),
      ).toBeVisible();
      const row = page.getByRole("row", { name: /Payment receipt/ });
      await expect(row).toContainText("Error EENVELOPE 451");
      await expect(row).toContainText("nominator1@example.com");
      await expectNoAxeViolations(page);
      // The e2e server writes mail to the dev outbox, so a resend is refused, with a message.
      await row.getByRole("button", { name: /Resend/ }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "not being sent over SMTP" }),
      ).toBeVisible();
      await expectNoAxeViolations(page);
    } finally {
      await e2eDb().query(`DELETE FROM email_outbox WHERE id = $1`, [rows[0].id]);
    }
  });

  test("is for admins only", async ({ page }) => {
    await signInAs(page, "judge1@example.org");
    expect((await page.goto("/admin/emails"))?.status()).toBe(403);
  });
});
