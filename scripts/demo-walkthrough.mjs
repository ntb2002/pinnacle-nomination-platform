// npm run demo:walkthrough  (after: npm run db:reset && npm run db:seed -- --open-now,
// with the app running on a dev/demo database with EMAIL_TRANSPORT=outbox)
// Drives the DEMO.md walkthrough in a real browser end to end and saves its screenshots
// to plans/artifacts/demo-*.png. BASE_URL defaults to http://localhost:3000.
import "dotenv/config";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import pg from "pg";

if (process.env.NODE_ENV === "production")
  throw new Error("Refused: demo walkthrough in production.");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ART = "plans/artifacts";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p = []) => (await pool.query(s, p)).rows;
const advance = (step) =>
  console.log(
    execSync(`npm run -s demo:advance -- ${step}`, {
      encoding: "utf8",
    }).trim(),
  );
const browser = await chromium.launch();
const shot = (page, name) => page.screenshot({ path: `${ART}/demo-${name}.png`, fullPage: false });
async function as(email) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("/sign-in");
  await p.getByLabel("Email address").fill(email);
  await p.getByRole("button", { name: "Email me a sign-in link" }).click();
  await p.getByRole("status").filter({ hasText: "Check your email" }).waitFor();
  await p.goto("/dev/mailbox");
  const link = await p
    .locator("li")
    .filter({ hasText: `To ${email}` })
    .first()
    .locator("a")
    .first()
    .getAttribute("href");
  await p.goto(link);
  await p.getByRole("button", { name: `Sign in as ${email}` }).click();
  await p.getByRole("button", { name: "Sign out" }).waitFor();
  return p;
}
// A plausible 300-word narrative from a few sentences, repeated.
const SENTENCES = [
  "Jordan rebuilt Brightline around long-term creator partnerships instead of one-off campaigns.",
  "Under that model, creator payouts rose for the third year in a row while churn fell sharply.",
  "The studio now shares production tools, legal templates and audience data with every partner.",
  "Peers have adopted the revenue-sharing contract Jordan published openly last spring.",
];
const words = (n) => {
  const out = [];
  for (let i = 0; out.length < n; i++) out.push(...SENTENCES[i % SENTENCES.length].split(" "));
  return out.slice(0, n).join(" ").replace(/[^.]$/, "$&.");
};

// 1. Nominate.
const nom = await as("nominator02@example.com");
await nom.goto("/entries/new");
await nom.getByLabel("CEO of the Year").check();
await nom.getByLabel("I am nominating someone else").check();
await nom.getByRole("button", { name: "Start the entry" }).click();
await nom.waitForURL(/\/edit$/);
const entryId = nom.url().split("/").at(-2);
await nom.getByLabel("Full name").first().fill("Jordan Demo");
await nom.getByLabel("Job title").first().fill("Chief Executive Officer");
await nom.getByLabel("Company or organization").fill("Brightline Creator Studios");
await nom.getByLabel("Email address").first().fill("jordan.demo@example.com");
await nom.getByLabel("Why this person deserves the award").fill(words(300));
for (const i of [0, 1]) {
  await nom
    .locator(`[id="outcomes.${i}.description"]`)
    .fill(`Outcome ${i + 1}: grew creator revenue`);
  await nom.locator(`[id="outcomes.${i}.dataPoint"]`).fill(`+${(i + 1) * 20}% year over year`);
}
const ref = (k) => nom.locator(`[id="references.0.${k}"]`);
await ref("name").fill("Morgan Ellis");
await ref("title").fill("VP, Partnerships");
await ref("organization").fill("Example Brand Co.");
await ref("email").fill("morgan.ellis@example.org");
await ref("phone").fill("+1 315 555 0142");
await ref("relationship").fill("Brand partner for three years");
await nom.getByRole("button", { name: "Save and review" }).click();
await nom.getByRole("heading", { name: "Ready to submit" }).waitFor();
await shot(nom, "1-review");
// 2. Pay (mock checkout).
await nom.getByRole("button", { name: /^Pay \$[\d,]+ and submit$/ }).click();
await nom.getByRole("heading", { level: 1, name: "Pay the entry fee" }).waitFor();
await shot(nom, "2-checkout");
await nom.getByRole("button", { name: /^Pay \$[\d,]+ \(test\)$/ }).click();
await nom.getByText("Status: Submitted").waitFor();
await shot(nom, "3-submitted");

// 3. Admin triage: approve.
const admin = await as("admin@example.org");
await admin.goto(`/admin/entries/${entryId}`);
await admin.getByRole("button", { name: "Approve the entry" }).waitFor();
await shot(admin, "4-triage");
await admin.getByRole("button", { name: "Approve the entry" }).click();
await admin.getByRole("status").first().waitFor();

// 4. Judge recusal: judge1 declares a conflict; judge4 declares none.
const cat = (await q(`SELECT category_id FROM entry WHERE id = $1`, [entryId]))[0].category_id;
const j1 = await as("judge1@example.org");
await j1.goto(`/judge/categories/${cat}?round=1`);
const card = (p) => p.locator("main li").filter({ hasText: "Jordan Demo" });
await card(j1).getByLabel("I have a conflict (I will be recused)").check();
await card(j1)
  .getByLabel("If you have a conflict, why")
  .fill("Jordan was my co-founder until 2025.");
await card(j1).getByRole("button", { name: "Save my answer" }).click();
await j1.getByRole("status").filter({ hasText: "Conflict recorded." }).waitFor();
await shot(j1, "5-recused");
for (const email of ["judge4@example.org"]) {
  const j = await as(email);
  await j.goto(`/judge/categories/${cat}?round=1`);
  await card(j).getByLabel("No conflict").check();
  await card(j).getByRole("button", { name: "Save my answer" }).click();
  await j.getByRole("status").filter({ hasText: "Your answer is saved." }).waitFor();
}
// The admin covers the recusal: judge2 joins CEO of the Year for round one.
const j2id = (await q(`SELECT id FROM "user" WHERE email = 'judge2@example.org'`))[0].id;
await admin.goto(`/admin/judges/${j2id}`);
const r1 = admin.locator("form").filter({ hasText: "Round 1 categories" });
await r1.getByLabel("CEO of the Year").check();
await r1.getByRole("button", { name: "Save round 1" }).click();
await r1.getByRole("status").waitFor();
const j2 = await as("judge2@example.org");
await j2.goto(`/judge/categories/${cat}?round=1`);
await card(j2).getByLabel("No conflict").check();
await card(j2).getByRole("button", { name: "Save my answer" }).click();
await j2.getByRole("status").filter({ hasText: "Your answer is saved." }).waitFor();

// 5. Close nominations; admin opens round one.
advance("close-nominations");
await admin.goto("/admin/judging");
await admin.getByLabel(/still in review will not be judged/).check();
await admin.getByRole("button", { name: "Open round one" }).click();
await admin.getByRole("status").filter({ hasText: "Round one is open." }).waitFor();
advance("fill-scores");

// 6. The two eligible judges score the demo entry.
for (const j of [await as("judge4@example.org"), j2]) {
  await j.goto(`/judge/entries/${entryId}?round=1`);
  for (const label of [
    "Impact & Results",
    "Innovation",
    "Industry Influence",
    "Reference Validation",
  ])
    await j.getByLabel(new RegExp(`^${label}`)).selectOption("10");
  if (j === j2) {
    const form = j.locator("form").filter({ hasText: "Weighted score" });
    await form.scrollIntoViewIfNeeded();
    await form.screenshot({ path: `${ART}/demo-6-score.png` });
  }
  await j.getByRole("button", { name: "Submit score" }).click();
  await j.getByRole("status").first().waitFor();
}

// 7. Close round one, choose finalists, announce.
await admin.goto("/admin/judging");
await admin.getByRole("button", { name: "Close round one" }).click();
await admin.getByRole("status").filter({ hasText: "Round one is closed." }).waitFor();
advance("select-others");
await admin.goto(`/admin/judging/${cat}`);
await admin.getByRole("button", { name: "Save the finalists" }).waitFor();
await shot(admin, "7-ranking");
await admin.getByRole("button", { name: "Save the finalists" }).click();
await admin.getByRole("status").filter({ hasText: "Finalists saved." }).waitFor();
await admin.goto("/admin/judging");
await admin.getByRole("button", { name: "Announce finalists" }).click();
await admin.getByRole("status").filter({ hasText: "Finalists announced." }).waitFor();

// 8. The nominator sees the result.
await nom.goto("/entries");
await nom.getByRole("row", { name: /Jordan Demo/ }).waitFor();
await shot(nom, "8-finalist");
console.log(
  "Jordan Demo:",
  (await nom.getByRole("row", { name: /Jordan Demo/ }).innerText()).replace(/\s+/g, " "),
);
await browser.close();
await pool.end();
