import { expect, type Page } from "@playwright/test";
import { e2eDb } from "./db";

/** Latest sign-in link emailed to `email` (from the outbox transport). */
export async function latestSignInLink(email: string): Promise<string> {
  const { rows } = await e2eDb().query<{ text_body: string }>(
    "SELECT text_body FROM email_outbox WHERE to_address = $1 AND template = 'sign-in' ORDER BY created_at DESC LIMIT 1",
    [email.toLowerCase()],
  );
  const link = rows[0]?.text_body.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`no sign-in email for ${email}`);
  return link;
}

/** Signs in through the real flow: request link → open emailed link → press Sign in. */
export async function signIn(page: Page, email: string, next = "/") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.goto(await latestSignInLink(email));
  await page.getByRole("button", { name: `Sign in as ${email.toLowerCase()}` }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

/** Requests a sign-in link for `email` from the sign-in page and returns the emailed link. */
export async function requestLink(page: Page, email: string): Promise<string> {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  return latestSignInLink(email);
}
