# Launch readiness

**Interim audit as of 2026-10-26, after #12.** Issue #18 replaces this with the final self-audit, including owners for every non-code item. Nominations open **Tuesday, January 26, 2027**.

## Where the build stands

Done and merged into `v1`, each issue closed with evidence: #1-#12. That covers the public site, sign-in and roles, program settings, nominations, supporting files, entry-fee payment, eligibility review, judges and conflicts of interest, and round-one scoring with finalist selection and announcement.

Since #12, on the `v1` line:
- Nodemailer was upgraded past its high-severity advisories.
- Failed transactional email is now recoverable: stored until delivered, retried automatically, and resendable by admins.
- A race between conflict declarations and the finalist announcement was reproduced by a test and fixed.
- Every date and fee is admin-editable, with the CCE timeline set as defaults.
- A scripted, repeatable demo was added (`DEMO.md`).

Everything a nominator needs on January 26 is built. What remains is needed later in the cycle: the finalist fee before finalists are announced (planned for late March), then round two and results.

## Remaining issues

The estimates are working days at the pace of #9-#12, including tests, the code-review and evaluator passes, and fixes.

| Issue | What | Needed by | Estimate | Risk |
|---|---|---|---|---|
| #13 Finalist package fee | Finalists pay through the existing pipeline; admins can waive with a reason; round-two eligibility | Before finalists are announced (judging closes Mar 27) | 0.5-1 day | Low: reuses #9 |
| #14 Round two, winners, embargo | Round-two scoring, winner and tiebreak rules, results hidden from everyone until publish, `/results` | Before round two (date not set) | 2 days | High: confidentiality of winners |
| #15 Disclosure and admin statistics | Public finalist-rate table, `/admin/stats`, CSV export | With the finalist announcement | 1 day | Low |
| #16 Audit viewer and security pass | `/admin/audit`, an automated guard-coverage test, nonce CSP, rate limits on uploads and checkout, shorter admin/judge sessions, secret scan | **Before nominations open** (security) | 2 days | Medium |
| #17 Journey tests and accessibility sweep | One end-to-end journey, axe on every route and role, keyboard pass, human screen-reader pass | **Before nominations open** (accessibility) | 1-1.5 days | Medium |
| #18 README, packaging, final audit | Dockerfile, migrate-on-start, deployment and operations docs, final LAUNCH_READINESS | **Before nominations open** (deployment) | 1 day | Medium: hosting is undecided |

Total: about 8 working days of build. #16, #17 and #18 come first if the order changes: they gate opening day, and #13-#15 do not.

## Launch blockers

### Before nominations open (Jan 26, 2027)

1. **Install CI.** The workflow is ready at `docs/ci/ci.yml`, but the agent is not allowed to write `.github/workflows/`. Steps are under *Human actions* below.
2. **Real Stripe check.** Run one test-mode payment through Stripe hosted Checkout (README → *Testing payments with Stripe test keys*). The build sandbox cannot reach `api.stripe.com`. Confirm Stripe is an approved university processor and decide whose account takes the money (`docs/open-questions.md`).
3. **Hosting, domain, backups.** Where the app, Postgres and file storage run; nightly backups with a tested restore; migrations at deploy (#18). The domain's HSTS scope is for Syracuse IT to decide.
4. **Email.** SMTP relay (`smtps://`), sending address, SPF/DKIM; someone owns **Admin → Emails**.
5. **CCE confirmations.** Dates, fees, category copy, methodology, the COI policy and refund wording (`docs/open-questions.md`). The public copy marked `TODO(copy)` needs CCE and counsel sign-off.
6. **Security and accessibility passes** (#16, #17), including a human screen-reader test.
7. **Privacy notice, terms and data retention policy.** Entries hold personal data about nominees and references.

### Before finalists are announced (late March 2027)

8. **#13** (finalist fee). The finalist email already tells finalists to pay from their entry page.
9. **#15** (the public disclosure promised by the methodology).

### Before results

10. **#14** (round two, embargo, publish).

## Known code gaps (accepted for now; risk and fix)

| Gap | Risk | Fix |
|---|---|---|
| Supporting files are not malware-scanned before judges download them | Medium | A ClamAV step or the bucket provider's scanner (0.5 day) |
| Refund and dispute webhooks are not handled; a duplicate or mismatched charge is only audited | Low | Finance watches **Admin → Payments**; #16's audit viewer adds a filter |
| Sessions last 7 days for every role | Medium | #16 (shorter for admins and judges) |
| CSP is not nonce-based | Low-Medium | #16 |
| Undelivered email bodies (receipts, results) stay in the database until delivered or resent | Low | A purge after N days, set by the retention policy |
| A sign-in email that fails before it is recorded can linger as "not kept" in **Admin → Emails** | Low | Hide or expire such rows (small) |
| Nominators whose entries are still in review when round one opens see "under review" indefinitely | Low | Wording and email to be decided by CCE (#12 *Needs human*) |
| Judges are not notified when round one is reopened | Low | CCE to decide whether to add a notice |
| The per-email sign-in limit can be used to stop someone from requesting links | Low | Admin SSO or a CAPTCHA after failures |
| Rate limits and audit IPs trust `X-Forwarded-For` at `TRUSTED_PROXY_HOPS` | Medium if misconfigured | Set it to match the real proxy at deploy (#18) |
| No sweep for orphaned stored file bytes; uploads need `Content-Length` | Low | Periodic sweep; check the load balancer |
| `drizzle-kit` (the migration CLI) pulls a deprecated esbuild with 4 moderate advisories | Low (dev server only, never served) | Upgrade when drizzle-kit 1.0 ships |
| No request timeout at the proxy | Low | Set one at the load balancer (defence in depth, #10 thread) |

`npm audit --omit=dev`: no high or critical findings after the Nodemailer 10.2.1 upgrade.

## Human actions

### Install CI through the GitHub UI

1. On GitHub, open the repository → **Code**, switch the branch to `v1`, and open `.github/workflows/ci.yml`.
2. Choose the pencil (**Edit this file**). Select all, delete, and paste the full contents of `docs/ci/ci.yml` (the file at that path on `v1`).
3. **Commit changes…** → *Commit directly to the `v1` branch* → **Commit changes**.
4. The **Actions** tab shows a "CI" run for that commit, and every push after it runs one. The job is named **Lint, typecheck, test, build, e2e** and takes about 10-15 minutes.
5. Optional: **Settings → Branches → Add rule** for `main`, with **Require status checks to pass** set to that job.

If you prefer the terminal: `cp docs/ci/ci.yml .github/workflows/ci.yml`, commit, and push to `v1`.

### Real Stripe test-mode payment

Set these in `.env` (test mode; never commit them):

```
PAYMENTS_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_…        # Stripe dashboard → Developers → API keys (test mode)
STRIPE_WEBHOOK_SECRET=whsec_…      # printed by: stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Then follow README → *Testing payments with Stripe test keys*: pay with card `4242 4242 4242 4242`; the entry becomes **Submitted** when `checkout.session.completed` returns 200 in `stripe listen`, and the receipt appears in `/dev/mailbox`. Record the session id and the screenshot as evidence on #9.
