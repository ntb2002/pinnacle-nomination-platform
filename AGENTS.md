# Pinnacle Awards Platform — Agent Constitution

> **For all AI coding agents** (Cursor, Claude Code, Aider, Codex). Read this first. Single source of truth for **conventions**. `CLAUDE.md` imports this file via `@AGENTS.md`.
>
> Context is split by volatility:
> | Doc | Holds | Changes |
> |---|---|---|
> | `VISION.md` | product thesis | rarely |
> | **`AGENTS.md`** (this file) | conventions, antipatterns, landing pad, roadmap index | slowly |
> | `docs/architecture.md` | data model, status machines, flows | slowly |
> | `docs/git-workflow.md` | git / CI / review process | rarely |
> | `plans/` | Deep-lane unit specs (open only) + optional project design notes | per Deep-lane unit |
> | `docs/status.md` | done / in progress / next / blockers, technical threads | every unit |
> | `DECISIONS.md` | decisions expensive to reverse | when one is made |

---

## 📍 Landing pad — where am I / what next

- **Product:** the nomination, payment and judging platform for the Pinnacle Awards (Syracuse University CCE). See `VISION.md`.
- **Tracker:** **GitHub Issues** — https://github.com/ntb2002/pinnacle-nomination-platform/issues. Issues live here and nowhere else: `/start-unit <n>` fetches with `gh issue view <n> --comments` (or the GitHub MCP) and stops if it can't.
- **Active project:** v1 launch build — issues #1-#18, nominations open 2027-01-26. Integration branch `v1`; one PR `v1 → main` at the end.
- **Next unit:** see `docs/status.md` → *Next*. Resume protocol after a reset: read `docs/status.md`, then the open issues in number order.
- **Working rhythm:** the issue's `lane` label says which. Every issue: branch `<n>-<slug>` from `v1`, tests, gate evidence, `code-review` + `evaluator` subagents, fix findings, merge into `v1`, close the issue with an evidence comment.
- **WIP limit:** one issue being built at a time.
- **Active background work:** none.

### Autonomous-run override (this build)

The owner (Nathan) directed this build to run fully autonomously: the agent is coordinator, builder and reviewer. That overrides three playbook defaults, and only these: (1) the agent merges issue branches into **`v1`** itself (never into `main`); (2) the agent closes issues after merge with a comment linking evidence; (3) there is no per-issue PR — the merge commit on `v1` plus the closing comment are the record. `main` changes only through the final human-reviewed PR from `v1`. Product questions and external accounts are recorded on the issue under `## Needs human`, stubbed safely, and work continues. Recorded as DECISIONS 002.

---

## What we're building (short)

A Next.js web app where nominators submit and pay for structured award entries, CCE admins triage entries and run two judging rounds, judges declare conflicts and score on a weighted rubric, and the public sees the methodology, panel, finalist-rate disclosure and (after an embargo) the winners. Credibility is the product: every rule the methodology states is enforced server-side and audit-logged.

## Roadmap

The tracker owns it (link above). History of what shipped: `docs/status.md`.

## Stack (locked in — reasoning in `DECISIONS.md` 003)

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 22 LTS | `.nvmrc` |
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) | Server components + server actions; `proxy.ts` (Next 16's middleware) |
| Database | PostgreSQL 16 via Prisma 7 (`@prisma/adapter-pg`) | Migrations in `prisma/migrations`, forward-only |
| Auth | Better Auth, email magic link, DB sessions | Roles on `User.role`; checks in `src/server/auth/guards.ts` |
| Payments | Stripe hosted Checkout + verified webhooks | `PAYMENTS_PROVIDER=mock` simulator for dev/CI/demo, refused in production |
| Files | Storage interface: local disk (dev) / S3-compatible (prod) | Magic-byte type checks |
| Email | Nodemailer SMTP (prod) / DB outbox (dev, test) | `/dev/mailbox` in dev only |
| Validation | zod 4, shared client/server | `src/lib/validation/` |
| Styling | Tailwind CSS 4, self-hosted fonts | Tokens meet WCAG 2.1 AA |
| Tests | Vitest (unit + integration on real Postgres), Playwright + axe-core (e2e) | CI runs all |

## How to run

```bash
cp .env.example .env          # fill DATABASE_URL etc.
npm install
npm run db:migrate && npm run db:seed
npm run dev                   # http://localhost:3000
npm run check                 # lint + typecheck + unit/integration tests
npm run test:e2e              # Playwright (builds and starts the app)
```

---

## Architecture conventions

- **Layers.** `src/app/**` routes are thin: read input, get the actor, call a service, render. Business rules live in `src/server/services/*` (server-only). Pure logic (pricing, scoring, word counts, validation schemas) lives in `src/lib/*` and is unit tested. UI components in `src/components/*`.
- **Authorization on every request, server side.** Every page, server action and route handler outside the public site calls `requireUser()` / `requireRole()` from `src/server/auth/guards.ts`. Services take an `Actor` and assert permission again (`assertRole`, ownership checks). `proxy.ts` redirects early for UX but is never the authority.
- **Ownership by query, not by trust.** Load records by id **and** owner/assignment (`where: { id, nominatorId: actor.id }`). Never accept a user id, role, price or status from the client.
- **Confidential data is least-privilege.** Nominee outcomes, references and files: the entry's nominator, admins, and assigned, unrecused judges only. Judges never see reference contact details, nominator identity or payments. Use the explicit `select` shapes in each service; never return whole Prisma rows to the client.
- **Audit everything privileged.** Every admin and judge mutation, and every admin read of reference contact details or files, calls `audit()` (`src/server/audit.ts`). Audit rows are append-only.
- **Config only through `src/lib/env.ts`.** It validates with zod at boot. No `process.env` anywhere else. Every variable is in `.env.example`.
- **Money is integer cents**, formatted only at render. **Times are stored UTC**, shown in America/New_York (`src/lib/dates.ts`).
- **Errors.** Services throw `AppError` subclasses (`ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`). Actions map them to user-safe messages. Never send stack traces or internal ids to the client.
- **Status changes go through the service state machines** (`docs/architecture.md`), never `db.entry.update({ status })` from a route.
- **Accessibility is a requirement (WCAG 2.1 AA).** Use the shared form primitives (`Field`, `ErrorSummary`), real labels, `aria-describedby` for hints/errors, visible focus, colour tokens from `globals.css`. Every new page gets an axe check in e2e.
- **Files under ~300 lines.** Split by responsibility when a file grows.
- **Tests with every unit.** Pure logic → unit test; service rules → integration test on Postgres; user flow → Playwright. Seed and fixtures use fake data only (`example.com`/`example.org`).

## Common-mistake antipatterns

- **Don't** check auth only in `proxy.ts` or only in the UI — check in the server action/route and in the service.
- **Don't** compute a price, score or winner in the client — compute server-side from `src/lib/pricing.ts` / `src/lib/scoring.ts`.
- **Don't** fulfil a payment from the success redirect — only from the verified webhook (or the mock provider's server-side completion).
- **Don't** trust a file's extension or browser MIME type — sniff magic bytes.
- **Don't** log PII (emails, phone numbers, narratives) or secrets.
- **Don't** expose winners before publish anywhere: pages, JSON, emails, entry statuses.
- **Don't** use `process.env` outside `src/lib/env.ts`; don't commit `.env`.
- **Don't** edit an applied migration; add a new one.

## What we're explicitly NOT building (or deferring)

- Public voting; ticketing/gala management; sponsor portals.
- In-app refunds (handled in the Stripe dashboard by CCE finance; see LAUNCH_READINESS).
- SSO (Syracuse NetID) for admins/judges — deferred, listed in LAUNCH_READINESS.
- Multi-cycle admin UI beyond the active cycle (data model supports it).

---

## Working with multiple AI agents

- **Single source of truth for conventions:** this file. **Thesis:** `VISION.md`. **How it works:** `docs/architecture.md`.
- **Git workflow:** never commit to `main`. Branch `<n>-<slug>` from `v1` → commits → push → merge into `v1` after the gate (see *Autonomous-run override*). Full model: `docs/git-workflow.md`.
- **Scoped rules are Cursor-native but bind every agent.** Before editing a file, read the `.cursor/rules/*.mdc` whose `globs` match it.
- **When you change a convention/architecture:** update `AGENTS.md` first, log it in `DECISIONS.md`.
- **When you finish a unit:** verify its gate, update `docs/status.md` + the landing pad, merge into `v1`, close the issue with evidence.
- **The issue is the spec.** Deep-lane units may also get `plans/features/<n>-<slug>.md` on their branch, deleted when the unit merges.
- **Automation:** rituals in `.agents/skills/`; guard via `.githooks/pre-commit`; subagents in `.claude/agents/`.

## Autonomy inside the box

Inside an issue, on its branch, you don't ask: edit, run tests / linters / builds / the app, iterate until the gate passes, call subagents (`code-review`, `evaluator`), commit, push. The human owns: merging to `main`, deploys, spend, real secrets, deleting data. Full doctrine: agent-playbook `PLAYBOOK.md` → *Autonomy inside the box*.

- **Protected checks — never change a check to make yourself pass.** Tests that existed when the branch was cut, fixtures, and CI config. Tests you add are reviewed like any code. Never weaken, skip, or delete an existing test to get to green.
- **Deny list:** `.claude/settings.json` denies agent edits to `.github/workflows/`, hooks, and `evals/`, plus force-push, pushing to `main`, `--no-verify`. The issue that owns CI (#2) creates the workflow; later CI changes are their own issue.
- **Loop bounds:** transient failure → retry twice · bad output format → repair once · gate still failing → up to 3 correction rounds · same error twice → escalate · ambiguous requirement → `## Needs human` on the issue, stub safely, continue · protected check change → separate issue.
- **Escalate** = push the branch, comment on the issue: what you tried, the last failure, best hypothesis, smallest decision needed.

## Quick reference

| Need | Go to |
|---|---|
| Product thesis | `VISION.md` |
| How it works | `docs/architecture.md` |
| What's next | GitHub Issues + `docs/status.md` |
| Git / CI / review workflow | `docs/git-workflow.md` |
| Decisions expensive to reverse | `DECISIONS.md` |
| Launch gaps | `LAUNCH_READINESS.md` |
