import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import { emailOutbox, user } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { requestSignIn } from "@/server/services/sign-in";
import { db, resetTables } from "../support/db";
import { createUser } from "../support/factories";

beforeEach(resetTables);
afterAll(closeDb);

const headers = () => new Headers({ origin: "http://localhost:3000" });
const request = (email: string, ip = "198.51.100.1") =>
  requestSignIn({ email, next: "/entries", ip, headers: headers() });

describe("requestSignIn", () => {
  it("emails a link to the confirmation page, never the raw verify URL", async () => {
    await request("Someone@Example.com");
    const [mail] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.toAddress, "someone@example.com"));
    expect(mail?.template).toBe("sign-in");
    const link = mail!.textBody.match(/https?:\/\/\S+/)?.[0] ?? "";
    const url = new URL(link);
    expect(url.pathname).toBe("/sign-in/confirm");
    expect(url.searchParams.get("token")).toBeTruthy();
    expect(url.searchParams.get("next")).toBe("/entries");
    expect(mail!.textBody).not.toContain("/api/auth/magic-link/verify");
  });

  it("blocks the sixth request for the same email in the window", async () => {
    for (let i = 0; i < 5; i++) await request("limit@example.com", `198.51.100.${i + 10}`);
    await expect(request("limit@example.com", "198.51.100.99")).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    expect(
      await db.select().from(emailOutbox).where(eq(emailOutbox.toAddress, "limit@example.com")),
    ).toHaveLength(5);
  });

  it("limits requests per IP across different emails", async () => {
    for (let i = 0; i < 20; i++) await request(`person${i}@example.com`, "198.51.100.200");
    await expect(request("one-more@example.com", "198.51.100.200")).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it("rejects malformed emails", async () => {
    await expect(request("not-an-email")).rejects.toBeInstanceOf(ValidationError);
  });

  it("sends nothing to a disabled account but responds the same way", async () => {
    await createUser("NOMINATOR", { email: "gone@example.com", disabledAt: new Date() });
    await expect(request("gone@example.com")).resolves.toBeUndefined();
    expect(
      await db.select().from(emailOutbox).where(eq(emailOutbox.toAddress, "gone@example.com")),
    ).toHaveLength(0);
  });

  it("does not create an account until the link is used", async () => {
    await request("fresh@example.com");
    expect(await db.select().from(user).where(eq(user.email, "fresh@example.com"))).toHaveLength(0);
  });
});

describe("sendEmail", () => {
  it("sends once per dedupe key", async () => {
    const msg = {
      to: "a@example.com",
      template: "t",
      content: { subject: "S", paragraphs: ["p"] },
      dedupeKey: "k1",
    };
    await sendEmail(msg);
    await sendEmail(msg);
    expect(await db.select().from(emailOutbox)).toHaveLength(1);
  });
});
