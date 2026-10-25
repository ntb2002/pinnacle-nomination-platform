# Pinnacle Awards Platform — Status Log

> Code-side history and the resume point for this build. Updated after every issue. If a session or context resets: read this file, then the open issues (https://github.com/ntb2002/pinnacle-nomination-platform/issues) in number order, and resume at **Next**.

## Now

- **Done:** #1, #2
- **In progress:** #3 Data model and seeded demo data (branch `3-data-model-seed`)
- **Next:** #4 Authentication, RBAC and audit logging
- **Blockers:** none

## Needs human (collected from issues)

- **Install the CI workflow (#2):** `cp docs/ci/ci.yml .github/workflows/ci.yml` and push. The agent's deny list blocks it from writing `.github/workflows/` (the permission prompt was denied, so I did not work around it). Until then each issue's [CI] evidence is a full `scripts/ci-local.sh` run, with the log committed under `plans/artifacts/`.

- Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`. The agent's deny list blocks it from doing this itself (by design); until then the agent runs `.githooks/pre-commit` by hand before each commit, and CI will run the same checks once #2 replaces the placeholder workflow.

- **HSTS scope (#2):** production sends `Strict-Transport-Security: max-age=63072000` without `includeSubDomains`/`preload`. Adding those commits the whole parent domain; Syracuse IT decides (LAUNCH_READINESS).

- **Program dates and finalist fee (#3):** nominations open 2027-01-26 (given). The early/regular/final deadlines (Feb 26 / Mar 26 / Apr 23, 2027) and the $1,500 finalist package fee are placeholders in `src/lib/program-defaults.ts`. Admins can change all of them in the app (#6). CCE to confirm.
- **Category descriptions (#3):** placeholder copy marked `TODO(copy)` for CCE staff.

## Open technical threads

- #8 must delete stored files when an attachment row goes (entry cascade deletes rows, not bytes).
- #5: show a "demo data" banner when the demo seed is loaded, so invented judges are never mistaken for the real panel.
- `src/lib/pricing.ts` landed early in #3 (the seed needs it); #6 adds the admin UI around it.
- `drizzle-kit` (dev-only) pulls a deprecated `@esbuild-kit` chain with 4 moderate `npm audit` advisories (esbuild dev-server CORS). Not in production deps; revisit when drizzle-kit 1.0 ships.
- Deploy-time migrations need `tsx` + `drizzle/` alongside the standalone server; packaging decided in #18.

## Log

### 2026-10-25 — v1 build started

- #2 — Next.js 16 foundation: env validation (exits on bad config), nonce CSP + security headers, Drizzle/Postgres (DECISIONS 004 replaced Prisma), health route, accessible layout + tokens, Vitest + Playwright/axe, CI staged at `docs/ci/ci.yml`. Review APPROVE WITH FIXES and evaluator FAIL on the 404 CSP; all fixed.
- #1 — playbook scaffold, VISION/AGENTS/DECISIONS, status log. Code review: APPROVE WITH FIXES (fixes applied).
- Spec: issues #1-#18 filed in dependency order. Integration branch `v1` created from `main`.
