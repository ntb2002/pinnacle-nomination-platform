import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { latestSignInLink, signIn } from "./support/auth";
import { e2eDb } from "./support/db";

test.describe("authentication and role gates", () => {
  test("sign-in page is accessible", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "valid email" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");
    await expectNoAxeViolations(page);
  });

  test("a nominator signs in with an emailed link and lands where they were going", async ({
    page,
  }) => {
    await signIn(page, "nominator01@example.com", "/entries");
    await expect(page).toHaveURL(/\/entries$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your entries" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("the emailed link works once; opening it does not spend it", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("nominator02@example.com");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");
    const link = await latestSignInLink("nominator02@example.com");
    // A link scanner opening the link must not consume it.
    await page.request.get(link);
    await page.goto(link);
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    // Reusing the same link fails.
    await page.goto(link);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "expired or was already used" }),
    ).toBeVisible();
  });

  test("a nominator gets 403 on /admin and /judge", async ({ page }) => {
    await signIn(page, "nominator03@example.com");
    for (const path of ["/admin", "/judge"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(403);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "You don't have access to this page",
      );
    }
    await expectNoAxeViolations(page);
  });

  test("anonymous visitors to protected areas are sent to sign-in", async ({ page }) => {
    for (const path of ["/judge", "/admin", "/entries"]) {
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace("/", "%2F")}`),
      );
    }
  });

  test("an admin reaches the admin area and the sign-in is audited", async ({ page }) => {
    await signIn(page, "admin@example.org", "/admin");
    await expect(
      page.getByRole("heading", { level: 1, name: "Program administration" }),
    ).toBeVisible();
    const { rows } = await e2eDb().query(
      `SELECT a.action FROM audit_log a JOIN "user" u ON u.id = a.actor_id WHERE u.email = 'admin@example.org' AND a.action = 'auth.signed_in'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  test("Better Auth endpoints other than verify are not exposed", async ({ request }) => {
    expect(
      (
        await request.post("/api/auth/sign-in/magic-link", { data: { email: "x@example.com" } })
      ).status(),
    ).toBe(404);
    expect((await request.get("/api/auth/get-session")).status()).toBe(404);
    expect((await request.post("/api/auth/sign-up/email", { data: {} })).status()).toBe(404);
  });
});
