# Pinnacle Awards Platform — Status Log

> Code-side history and the resume point for this build. Updated after every issue. If a session or context resets: read this file, then the open issues (https://github.com/ntb2002/pinnacle-nomination-platform/issues) in number order, and resume at **Next**.

## Now

- **Done:** #1
- **In progress:** #2 App foundation (branch `2-app-foundation`)
- **Next:** #3 Data model and seeded demo data
- **Blockers:** none

## Needs human (collected from issues)

- **Install the CI workflow (#2):** `cp docs/ci/ci.yml .github/workflows/ci.yml` and push. The agent's deny list blocks it from writing `.github/workflows/` (the permission prompt was denied, so I did not work around it). Until then each issue's [CI] evidence is a full `scripts/ci-local.sh` run, with the log committed under `plans/artifacts/`.

- Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`. The agent's deny list blocks it from doing this itself (by design); until then the agent runs `.githooks/pre-commit` by hand before each commit, and CI will run the same checks once #2 replaces the placeholder workflow.

- **HSTS scope (#2):** production sends `Strict-Transport-Security: max-age=63072000` without `includeSubDomains`/`preload`. Adding those commits the whole parent domain; Syracuse IT decides (LAUNCH_READINESS).

## Open technical threads

- `drizzle-kit` (dev-only) pulls a deprecated `@esbuild-kit` chain with 4 moderate `npm audit` advisories (esbuild dev-server CORS). Not in production deps; revisit when drizzle-kit 1.0 ships.
- Deploy-time migrations need `tsx` + `drizzle/` alongside the standalone server; packaging decided in #18.

## Log

### 2026-10-25 — v1 build started

- #1 — playbook scaffold, VISION/AGENTS/DECISIONS, status log. Code review: APPROVE WITH FIXES (fixes applied).
- Spec: issues #1-#18 filed in dependency order. Integration branch `v1` created from `main`.
