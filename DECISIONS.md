# Pinnacle Awards Platform — Architecture Decision Log

> Append-only log of decisions that are **expensive to reverse**. One entry per decision. Newest at the top. When a decision is superseded, add a new entry referencing the old one — don't edit history.
>
> Format: `### NNN — Title (date) — Status` · **Decision** · **Why** · **Rejected** · **Reverse cost**.

### 003 — Application stack (2026-10) — Accepted

- **Decision:** One TypeScript codebase: Next.js 16 (App Router, server components and server actions) on Node 24 LTS (Node 22 reaches end of life 2027-04-30, during the first cycle), PostgreSQL 16 through Prisma 7, Better Auth (email magic link, database sessions), Stripe hosted Checkout with signed webhooks, Tailwind CSS 4, zod 4, Vitest + Playwright + axe-core. Payment, file storage and email each sit behind a small interface with a production driver and a local driver. Ships as a container (Next standalone output) that runs on any Node host with managed Postgres and S3-compatible storage.
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
