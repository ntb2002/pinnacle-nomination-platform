import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { requestLink, signIn } from "./support/auth";
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
    context,
  }) => {
    await signIn(page, "nominator01@example.com", "/entries");
    await expect(page).toHaveURL(/\/entries$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your entries" })).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name.endsWith("pinnacle.session_token"));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    await expectNoAxeViolations(page);
  });

  test("the emailed link works once; opening it does not spend it", async ({ page }) => {
    const link = await requestLink(page, "nominator02@example.com");
    // A link scanner opening the link must not consume it.
    await page.request.get(link);
    await page.goto(link);
    await expect(page.getByText("This link signs you in as nominator02@example.com")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Sign in as nominator02@example.com" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.goto(link);
    await expect(page.getByText("This sign-in link has expired or was already used")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("an expired link is refused", async ({ page }) => {
    const link = await requestLink(page, "nominator05@example.com");
    await e2eDb().query(
      "UPDATE verification SET expires_at = now() - interval '1 minute' WHERE identifier LIKE 'magic-link:%'",
    );
    await page.goto(link);
    await expect(page.getByText("This sign-in link has expired or was already used")).toBeVisible();
  });

  test("a link for a since-disabled account creates no session", async ({ page }) => {
    const link = await requestLink(page, "nominator06@example.com");
    await e2eDb().query(
      `UPDATE "user" SET disabled_at = now() WHERE email = 'nominator06@example.com'`,
    );
    try {
      await page.goto(link);
      await page.getByRole("button", { name: "Sign in as nominator06@example.com" }).click();
      await expect(page).toHaveURL(/\/sign-in\?error=/);
      const { rows } = await e2eDb().query(
        `SELECT count(*)::int AS n FROM session s JOIN "user" u ON u.id = s.user_id WHERE u.email = 'nominator06@example.com'`,
      );
      expect(rows[0].n).toBe(0);
    } finally {
      await e2eDb().query(
        `UPDATE "user" SET disabled_at = NULL WHERE email = 'nominator06@example.com'`,
      );
    }
  });

  test("verify refuses cross-site requests and foreign redirect targets", async ({ page }) => {
    const link = await requestLink(page, "nominator07@example.com");
    const token = new URL(link).searchParams.get("token")!;
    const verify = (callbackURL: string, site: string) =>
      page.request.get(
        `/api/auth/magic-link/verify?token=${token}&callbackURL=${encodeURIComponent(callbackURL)}`,
        {
          headers: { "sec-fetch-site": site },
          maxRedirects: 0,
        },
      );
    const crossSite = await verify("/", "cross-site");
    expect(crossSite.status()).toBe(303);
    expect(crossSite.headers().location).toMatch(/\/sign-in\?error=link$/);
    expect((await verify("https://evil.example/", "same-origin")).status()).toBe(403);
    expect(
      (
        await page.request.get(`/api/auth/magic-link/verify?token=${token}`, { maxRedirects: 0 })
      ).status(),
    ).toBe(400);
  });

  test("a signed-in user is never redirected off-site by next", async ({ page }) => {
    await signIn(page, "nominator08@example.com");
    for (const next of ["/.//evil.example/phish", "//evil.example", "/%2e//evil.example"]) {
      await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
      expect(new URL(page.url()).host).toBe(new URL(page.context().pages()[0]!.url()).host);
      await expect(page).toHaveURL(/localhost:\d+\/$/);
    }
  });

  test("the confirmation page warns before switching accounts", async ({ page, browser }) => {
    await signIn(page, "nominator09@example.com");
    // Someone else's link, requested elsewhere, opened in this signed-in browser.
    const other = await browser.newContext();
    const link = await requestLink(await other.newPage(), "nominator10@example.com");
    await other.close();
    await page.goto(link);
    await expect(
      page.getByRole("alert").filter({ hasText: "You are signed in as nominator09@example.com" }),
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
      const url = new URL(page.url());
      expect(url.pathname).toBe("/sign-in");
      expect(url.searchParams.get("next")).toBe(path);
    }
  });

  test("an admin reaches the admin area and the sign-in is audited", async ({ page }) => {
    await signIn(page, "admin@example.org", "/admin");
    await expect(
      page.getByRole("heading", { level: 1, name: "Program administration" }),
    ).toBeVisible();
    const { rows } = await e2eDb().query(
      `SELECT a.actor_role, a.ip FROM audit_log a JOIN "user" u ON u.id = a.actor_id WHERE u.email = 'admin@example.org' AND a.action = 'auth.signed_in'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].actor_role).toBe("ADMIN");
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
