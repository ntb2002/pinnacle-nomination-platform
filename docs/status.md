# Pinnacle Awards Platform — Status Log

> Code-side history and the resume point for this build. Updated after every issue. If a session or context resets: read this file, then the open issues (https://github.com/ntb2002/pinnacle-nomination-platform/issues) in number order, and resume at **Next**.

## Now

- **Done:** #1, #2, #3, #4, #5, #6, #7
- **In progress:** —
- **Next:** #8 Secure supporting-file uploads
- **Blockers:** none

## Needs human (collected from issues)

- **Install the CI workflow (#2):** `cp docs/ci/ci.yml .github/workflows/ci.yml` and push. The agent's deny list blocks it from writing `.github/workflows/` (the permission prompt was denied, so I did not work around it). Until then each issue's [CI] evidence is a full `scripts/ci-local.sh` run, with the log committed under `plans/artifacts/`.

- Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`. The agent's deny list blocks it from doing this itself (by design); until then the agent runs `.githooks/pre-commit` by hand before each commit, and CI will run the same checks once #2 replaces the placeholder workflow.

- **HSTS scope (#2):** production sends `Strict-Transport-Security: max-age=63072000` without `includeSubDomains`/`preload`. Adding those commits the whole parent domain; Syracuse IT decides (LAUNCH_READINESS).

- **Program dates and finalist fee (#3):** nominations open 2027-01-26 (given). The early/regular/final deadlines (Feb 26 / Mar 26 / Apr 23, 2027) and the $1,500 finalist package fee are placeholders in `src/lib/program-defaults.ts`. Admins can change all of them in the app (#6). CCE to confirm.
- **Copy and legal review (#3, #5):** all public copy is marked `TODO(copy)`: category descriptions, home thesis (the "first academically credentialed" claim needs substantiating), methodology, fees and refund wording (no contact address yet), and the COI policy (the 3-year lookback and the finalist-package requirement for round two need counsel sign-off). The payment copy names Stripe, which assumes it is approved as the university's processor.

- **"CCE staff" relationship (#7):** any nominator can choose "I am CCE staff nominating someone"; nothing verifies it. Options: restrict STAFF to admin accounts, or keep it self-declared and visible to triage. Currently self-declared.

## Open technical threads

- #9: lock an entry's content while a checkout is open (or block checkout when content changed after review), re-run readiness with `toSubmissionInput` under `FOR UPDATE`, and check the category is enabled (`FOR SHARE`).
- #10: decide whether a returned entry may change the nominee (today any field can change before resubmission); show admins a change summary on resubmission; map a category change hitting the duplicate index to a field error.
- #7/#9: the submit/fulfil path must read the entry's category `FOR SHARE` and refuse a withdrawn (disabled) category, to serialize with category withdrawal.
- Rate limiting and audit IPs use the `TRUSTED_PROXY_HOPS`-th `X-Forwarded-For` entry from the right; production must sit behind a proxy that appends it (LAUNCH_READINESS). The per-email sign-in limit (5 per sliding 15 minutes) means someone who knows an address can keep that person from requesting new links for as long as they keep sending about 5 requests every 15 minutes. Accepted trade-off against email bombing; LAUNCH_READINESS lists mitigations (admin SSO, a CAPTCHA after failures).
- Shorter sessions for admins/judges are scheduled for #16 (all roles get 7 days today).
- #8 must delete stored files when an attachment row goes (entry cascade deletes rows, not bytes).
- `src/lib/pricing.ts` landed early in #3 (the seed needs it); #6 adds the admin UI around it.
- `drizzle-kit` (dev-only) pulls a deprecated `@esbuild-kit` chain with 4 moderate `npm audit` advisories (esbuild dev-server CORS). Not in production deps; revisit when drizzle-kit 1.0 ships.
- Deploy-time migrations need `tsx` + `drizzle/` alongside the standalone server; packaging decided in #18.

## Log

### 2026-10-25 — v1 build started

- #7 — Nomination start/edit/review/dashboard with draft and submission schemas, ownership by query, duplicate nominee rule as a field error, self-nomination email locked, stable outcome/reference rows, delete unpaid draft. Review APPROVE WITH FIXES (stale form after save, raw messages, 500 on bad ids) → fixed; evaluator FAIL → fixed → re-evaluation found group-link scroll and typing-during-save → fixed.
- #6 — Admin dates/fees, categories, rubric weights with phase rules (DECISIONS 006), audited before/after, linked error summaries. Review APPROVE WITH FIXES; evaluator FAIL (audit values, summary links) → fixed → re-evaluation: one aria gap (rubric total) → fixed and covered by e2e.
- #5 — Public site (home, categories, fees, methodology, panel, COI policy) driven by the live cycle; demo banner; nav current-page state; Eastern-time helpers (`src/lib/zoned-time.ts`). Review APPROVE WITH FIXES: copy now promises only what is enforced, and the spec additions on #9, #11, #12 make the rest enforceable. Evaluator PASS.
- #4 — Magic-link auth (confirm step, single-use hashed 15-min tokens, login-CSRF and open-redirect defenses, allow-listed auth HTTP surface), DB sessions, requireUser/requireRole + assertRole, grantRole/setUserDisabled + CLI, audit service, sliding-window Postgres rate limits with trusted-proxy IPs, email outbox/SMTP. Review BLOCK → all fixed → re-review APPROVE; evaluator FAIL (rate-limit window) → fixed.
- #3 — Drizzle schema for the whole program with policy constraints (composite FKs, restrict deletes, partial unique indexes, CHECKs), append-only audit trigger, idempotent fake seed (63 entries), pricing module, factories. Review APPROVE WITH FIXES; all High fixed.
- #2 — Next.js 16 foundation: env validation (exits on bad config), nonce CSP + security headers, Drizzle/Postgres (DECISIONS 004 replaced Prisma), health route, accessible layout + tokens, Vitest + Playwright/axe, CI staged at `docs/ci/ci.yml`. Review APPROVE WITH FIXES and evaluator FAIL on the 404 CSP; all fixed.
- #1 — playbook scaffold, VISION/AGENTS/DECISIONS, status log. Code review: APPROVE WITH FIXES (fixes applied).
- Spec: issues #1-#18 filed in dependency order. Integration branch `v1` created from `main`.
