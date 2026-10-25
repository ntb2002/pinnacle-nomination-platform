# Pinnacle Awards Platform — Status Log

> Code-side history and the resume point for this build. Updated after every issue. If a session or context resets: read this file, then the open issues (https://github.com/ntb2002/pinnacle-nomination-platform/issues) in number order, and resume at **Next**.

## Now

- **Done:** #1, #2, #3, #4
- **In progress:** #5 Public program site (branch `5-public-site`)
- **Next:** #6 Admin program settings
- **Blockers:** none

## Needs human (collected from issues)

- **Install the CI workflow (#2):** `cp docs/ci/ci.yml .github/workflows/ci.yml` and push. The agent's deny list blocks it from writing `.github/workflows/` (the permission prompt was denied, so I did not work around it). Until then each issue's [CI] evidence is a full `scripts/ci-local.sh` run, with the log committed under `plans/artifacts/`.

- Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`. The agent's deny list blocks it from doing this itself (by design); until then the agent runs `.githooks/pre-commit` by hand before each commit, and CI will run the same checks once #2 replaces the placeholder workflow.

- **HSTS scope (#2):** production sends `Strict-Transport-Security: max-age=63072000` without `includeSubDomains`/`preload`. Adding those commits the whole parent domain; Syracuse IT decides (LAUNCH_READINESS).

- **Program dates and finalist fee (#3):** nominations open 2027-01-26 (given). The early/regular/final deadlines (Feb 26 / Mar 26 / Apr 23, 2027) and the $1,500 finalist package fee are placeholders in `src/lib/program-defaults.ts`. Admins can change all of them in the app (#6). CCE to confirm.
- **Copy review (#3, #5):** category descriptions, the conflict-of-interest policy and the refund wording are placeholder copy marked `TODO(copy)` for CCE staff (and counsel for the COI policy).

## Open technical threads

- Rate limiting and audit IPs use the `TRUSTED_PROXY_HOPS`-th `X-Forwarded-For` entry from the right; production must sit behind a proxy that appends it (LAUNCH_READINESS). The per-email sign-in limit (5 per sliding 15 minutes) means someone who knows an address can keep that person from requesting new links for as long as they keep sending about 5 requests every 15 minutes. Accepted trade-off against email bombing; LAUNCH_READINESS lists mitigations (admin SSO, a CAPTCHA after failures).
- Shorter sessions for admins/judges are scheduled for #16 (all roles get 7 days today).
- #8 must delete stored files when an attachment row goes (entry cascade deletes rows, not bytes).
- `src/lib/pricing.ts` landed early in #3 (the seed needs it); #6 adds the admin UI around it.
- `drizzle-kit` (dev-only) pulls a deprecated `@esbuild-kit` chain with 4 moderate `npm audit` advisories (esbuild dev-server CORS). Not in production deps; revisit when drizzle-kit 1.0 ships.
- Deploy-time migrations need `tsx` + `drizzle/` alongside the standalone server; packaging decided in #18.

## Log

### 2026-10-25 — v1 build started

- #4 — Magic-link auth (confirm step, single-use hashed 15-min tokens, login-CSRF and open-redirect defenses, allow-listed auth HTTP surface), DB sessions, requireUser/requireRole + assertRole, grantRole/setUserDisabled + CLI, audit service, sliding-window Postgres rate limits with trusted-proxy IPs, email outbox/SMTP. Review BLOCK → all fixed → re-review APPROVE; evaluator FAIL (rate-limit window) → fixed.
- #3 — Drizzle schema for the whole program with policy constraints (composite FKs, restrict deletes, partial unique indexes, CHECKs), append-only audit trigger, idempotent fake seed (63 entries), pricing module, factories. Review APPROVE WITH FIXES; all High fixed.
- #2 — Next.js 16 foundation: env validation (exits on bad config), nonce CSP + security headers, Drizzle/Postgres (DECISIONS 004 replaced Prisma), health route, accessible layout + tokens, Vitest + Playwright/axe, CI staged at `docs/ci/ci.yml`. Review APPROVE WITH FIXES and evaluator FAIL on the 404 CSP; all fixed.
- #1 — playbook scaffold, VISION/AGENTS/DECISIONS, status log. Code review: APPROVE WITH FIXES (fixes applied).
- Spec: issues #1-#18 filed in dependency order. Integration branch `v1` created from `main`.
