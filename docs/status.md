# Pinnacle Awards Platform — Status Log

> Code-side history and the resume point for this build. Updated after every issue. If a session or context resets: read this file, then the open issues (https://github.com/ntb2002/pinnacle-nomination-platform/issues) in number order, and resume at **Next**.

## Now

- **Done:** #1
- **In progress:** —
- **Next:** #2 App foundation
- **Blockers:** none

## Needs human (collected from issues)

- Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`. The agent's deny list blocks it from doing this itself (by design); until then the agent runs `.githooks/pre-commit` by hand before each commit, and CI will run the same checks once #2 replaces the placeholder workflow.

## Open technical threads

- none yet

## Log

### 2026-10-25 — v1 build started

- #1 — playbook scaffold, VISION/AGENTS/DECISIONS, status log. Code review: APPROVE WITH FIXES (fixes applied).
- Spec: issues #1-#18 filed in dependency order. Integration branch `v1` created from `main`.
