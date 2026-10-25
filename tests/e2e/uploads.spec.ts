import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import { signInAs } from "./support/auth";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

async function startDraft(page: Page, email: string) {
  await signInAs(page, email, "/entries/new");
  await page.getByLabel("Top Service Leader of the Year").check();
  await page.getByLabel("I am nominating someone else").check();
  await page.getByRole("button", { name: "Start the entry" }).click();
  await expect(page).toHaveURL(/\/entries\/[0-9a-f-]+\/edit$/);
  return page.url().split("/").at(-2)!;
}

test.describe("supporting files", () => {
  test("upload, list, download, refuse a disguised file, and remove", async ({ page }) => {
    const entryId = await startDraft(page, "nominator13@example.com");
    const files = page.locator("#files");
    await expect(files.getByRole("heading", { name: "Supporting files (optional)" })).toBeVisible();
    await expect(files.getByText("No files added.")).toBeVisible();

    await files.getByLabel("Add a file").setInputFiles({
      name: "Q3 results.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await files.getByRole("button", { name: "Upload the file" }).click();
    await expect(page).toHaveURL(/upload=ok#files-message$/);
    await expect(page.getByRole("status").filter({ hasText: "File uploaded." })).toBeFocused();
    const link = files.getByRole("link", { name: "Q3 results.pdf" });
    await expect(link).toBeVisible();
    await expect(files.getByText(`PDF, ${PDF.byteLength} B`)).toBeVisible();
    await expectNoAxeViolations(page);

    // The download is an attachment with safe headers and the original bytes.
    const href = (await link.getAttribute("href"))!;
    const res = await page.request.get(href);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["content-disposition"]).toContain("attachment;");
    expect(res.headers()["content-disposition"]).toContain("filename*=UTF-8''Q3%20results.pdf");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["cache-control"]).toBe("private, no-store");
    expect(Buffer.from(await res.body()).equals(PDF)).toBe(true);

    // HTML renamed to .pdf is refused by its content.
    await files.getByLabel("Add a file").setInputFiles({
      name: "invoice.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("<html><script>alert(1)</script></html>"),
    });
    await files.getByRole("button", { name: "Upload the file" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "That file is not a PDF, PNG or JPEG." }),
    ).toBeFocused();
    await expect(files.getByRole("listitem")).toHaveCount(1);

    // The review page lists the file too.
    await page.goto(`/entries/${entryId}`);
    await expect(page.getByRole("link", { name: "Q3 results.pdf" })).toBeVisible();

    await page.goto(`/entries/${entryId}/edit`);
    await files.getByRole("button", { name: "Remove Q3 results.pdf" }).click();
    await expect(page.getByRole("status").filter({ hasText: "File removed." })).toBeFocused();
    await expect(files.getByText("No files added.")).toBeVisible();
    expect((await page.request.get(href)).status()).toBe(404);
  });

  test("an oversized file is stopped before it is sent", async ({ page }) => {
    await startDraft(page, "nominator14@example.com");
    const files = page.locator("#files");
    await files.getByLabel("Add a file").setInputFiles({
      name: "huge.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(10 * 1024 * 1024 + 10, 0x25),
    });
    await files.getByRole("button", { name: "Upload the file" }).click();
    await expect(files.getByText("That file is larger than 10 MB.")).toBeVisible();
    await expect(files.getByLabel("Add a file")).toBeFocused();
    await expect(page).not.toHaveURL(/uploadError/);
  });

  test("cross-origin uploads and other people's files are refused", async ({ page, browser }) => {
    const entryId = await startDraft(page, "nominator15@example.com");
    const files = page.locator("#files");
    await files.getByLabel("Add a file").setInputFiles({
      name: "proof.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await files.getByRole("button", { name: "Upload the file" }).click();
    const href = (await files.getByRole("link", { name: "proof.pdf" }).getAttribute("href"))!;

    const forged = await page.request.post(`/api/entries/${entryId}/attachments`, {
      headers: { origin: "https://evil.example" },
      multipart: { file: { name: "x.pdf", mimeType: "application/pdf", buffer: PDF } },
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(403);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signInAs(otherPage, "nominator16@example.com");
    expect((await otherPage.request.get(href)).status()).toBe(404);
    const anon = await browser.newContext();
    expect((await anon.request.get(new URL(href, page.url()).href)).status()).toBe(404);
    await other.close();
    await anon.close();
  });
});
