# Pinnacle Awards Platform — Architecture Decision Log

> Append-only log of decisions that are **expensive to reverse**. One entry per decision. Newest at the top. When a decision is superseded, add a new entry referencing the old one — don't edit history.
>
> Format: `### NNN — Title (date) — Status` · **Decision** · **Why** · **Rejected** · **Reverse cost**.

### 006 — When dates and fees can change (2026-10) — Accepted

- **Decision:** During nominations, admins may change any date or fee, including extending a deadline that has passed. Opening cannot move later than an entry that was already submitted. Fees must not decrease from early to regular to late. Once round one opens, the nomination window and entry fees are frozen. Once finalists are announced, the finalist package fee is frozen. Rubric weights and category rubrics are frozen once round one opens. Every change is audited with before/after values. An entry keeps the fee stored on its payment.
- **Why:** Extensions are routine for awards programs, and they are audited. Changing the window or fees after judging starts would let the public fees page show nominations as open while judging runs, and would make finalist-fee charges differ between finalists. A fee that drops at a later deadline would contradict the published "escalating by deadline" structure.
- **Rejected:** Freezing dates once nominations open (too rigid for extensions); no rules at all (the reviewer showed the inconsistent states it allows).
- **Reverse cost:** low. The rules live in one function (`assertSettingsChangeAllowed`) plus the validation module.
- **Needs human:** CCE to confirm extensions are acceptable policy, and to decide whether extensions should also extend the early tier (today only the deadline the admin moves changes).

### 005 — Passwordless sign-in with a confirmation step and a minimal auth surface (2026-10) — Accepted

- **Decision:** Magic-link sign-in only (no passwords). Emailed links open a confirmation page; the single-use token is spent only by its button. Better Auth's HTTP API is allow-listed to the verify endpoint; sign-in requests and sign-out are server actions; rate limits live in Postgres. Roles are read from the database on every request.
- **Why:** Nominators sign in a few times a year, so passwords would mostly generate resets and reuse risk. University mail runs link scanners that would otherwise burn tokens. Exposing only one auth endpoint removes sign-up/update APIs we don't use. Database-backed limits hold across instances without Redis. A per-request role read makes revocation immediate, which matters for judges with access to confidential entries.
- **Rejected:** Passwords (support burden); Better Auth's built-in rate limiting (memory by default; a second mechanism); session cookie caching (stale roles); Syracuse SSO for staff now (needs IT onboarding: LAUNCH_READINESS).
- **Reverse cost:** low to medium. SSO can be added as another Better Auth plugin for admins and judges.

### 004 — Drizzle ORM instead of Prisma (2026-10) — Accepted (supersedes the ORM part of 003)

- **Decision:** Use Drizzle ORM 0.45 with `node-postgres` for data access. Schema in TypeScript (`src/server/db/tables/*`); `drizzle-kit generate` writes plain SQL migrations to `drizzle/`; `npm run db:migrate` applies them with drizzle's migrator (no CLI or binary needed at deploy time).
- **Why:** Prisma 7's migration engine is a native binary downloaded from `binaries.prisma.sh` at install/run time. That host is unreachable from this build environment, and university hosting with restricted egress could hit the same wall at deploy time. Drizzle is pure TypeScript with no engine binaries. Its migrations are plain SQL files that a Syracuse IT reviewer can read, and its queries read like SQL, which makes authorization filters easy to audit. Better Auth ships a Drizzle adapter.
- **Rejected:** Prisma 7 (binary engine download; the bundled wasm engine is not usable for `migrate` in 7.10); Kysely + hand-written migrations (more boilerplate for the next maintainer); raw `pg` (no typed schema).
- **Reverse cost:** medium. It touches the data layer only. Services own all queries, so routes and UI do not change.

### 003 — Application stack (2026-10) — Accepted

- **Decision:** One TypeScript codebase: Next.js 16 (App Router, server components and server actions) on Node 24 LTS (Node 22 reaches end of life 2027-04-30, during the first cycle), PostgreSQL 16 through Prisma 7 (superseded by 004: Drizzle), Better Auth (email magic link, database sessions), Stripe hosted Checkout with signed webhooks, Tailwind CSS 4, zod 4, Vitest + Playwright + axe-core. Payment, file storage and email each sit behind a small interface with a production driver and a local driver. Ships as a container (Next standalone output) that runs on any Node host with managed Postgres and S3-compatible storage.
- **Why:**
  - *Maintainable by the next person.* Next.js/React/TypeScript is the most widely taught and hired web stack; a Syracuse student or a contractor can pick it up. One language and one deployable for UI and server means fewer moving parts than a separate API + SPA.
  - *Server-side authority by default.* Server components and server actions keep data access, authorization and pricing on the server; the client gets rendered HTML and minimal JS.
  - *Postgres + Prisma* gives relational integrity (unique constraints encode program rules such as one score per judge per entry), readable schema, and forward-only migrations. Postgres is available on every cloud and on university infrastructure.
  - *Better Auth* is stable (1.x) and keeps sessions and users in our own Postgres. next-auth v5 is still beta as of Oct 2026; hand-rolled auth is a maintenance and security liability. Magic links avoid storing passwords for users who sign in a few times a year; SSO can be added later for staff (Better Auth supports SAML/OIDC plugins).
  - *Stripe hosted Checkout* keeps card data off our servers (PCI SAQ A scope). The provider interface lets the university substitute its approved processor.
  - *Easy to host.* A single container plus Postgres plus an S3 bucket plus SMTP. Works on Azure App Service, AWS, Render, Fly, or Vercel.
- **Rejected:** Django/Rails + separate frontend (two languages for a small team); Supabase/Firebase (vendor coupling, row-level-security logic split across SQL and app); Drizzle (pre-1.0); next-auth v5 (beta); building a custom card form (PCI scope); TypeScript 7 native compiler (too new for the tooling ecosystem — pinned to 5.9).
- **Reverse cost:** high — touches every file. Mitigated by keeping business rules in plain TypeScript services (`src/server/services`) and pure modules (`src/lib`) that do not depend on Next.js.

### 002 — Fully autonomous build run (2026-10) — Accepted

- **Decision:** For the v1 build the agent acts as coordinator, builder and reviewer end to end. It merges each issue branch into `v1` after the gate, the `code-review` subagent and the `evaluator` subagent pass, and closes the issue with an evidence comment. No per-issue PRs. One PR `v1 → main` at the end for human review. Product questions and external-account needs go under `## Needs human` on the issue with a safe stub.
- **Why:** The owner's explicit instruction for this build. The playbook's human clicks (promote, merge) are replaced by the agent's gate + two independent subagent reviews per issue, and the human review moves to the single final PR. `main` stays sacred.
- **Rejected:** Per-issue PRs awaiting human merge (the owner asked not to be waited on).
- **Reverse cost:** low — later work goes back to the default playbook loop (issue → branch → PR → human merge).

### 001 — Tracker and branching model (2026-10) — Accepted

- **Decision:** GitHub Issues is the tracker (labels: `accepted` = Backlog, `ready` = Todo, `lane: standard|deep`, `tier: fast|mid|strong`, `feature|bug|improvement`). Branches: `main` ← `v1` (integration) ← `<issue>-<slug>`. CI runs on every push and PR (the real workflow lands in #2; until then it is the template placeholder).
- **Why:** Solo-builder repo; GitHub mobile is the review surface; issues close from commit/PR references.
- **Rejected:** Linear (no stakeholders beyond the owner in the tracker for this build).
- **Reverse cost:** low.
