---
name: context-sync
description: Reconcile the docs with reality after a work session
disable-model-invocation: true
allowed-tools: Read, Edit, Bash(git status:*), Bash(git diff:*), Bash(git log:*)
---

# /context-sync

Reconcile the context docs with what actually changed. Do **not** write feature code.

1. Inspect: `git status`, `git diff`, recent `git log`.
2. Update **`docs/status.md`** (add a dated entry for what shipped; adjust open *technical* threads). Most updates land here — it's the volatile doc. It is code-side history, not a queue. In this repo its *Now* section also carries a one-line done / in progress / next / blockers pointer as the resume point after a session reset (owner's instruction for the v1 build); the tracker remains the authority on delivery status.
3. Update the **`AGENTS.md` landing pad** if the active project or *Next unit* changed. The landing pad points at the tracker; it does not list the backlog.
4. If a **convention/architecture** changed: update `AGENTS.md` and/or `docs/architecture.md`, and the relevant `.cursor/rules/*.mdc`.
5. If a **decision expensive to reverse** was made: append to `DECISIONS.md`.
6. Keep `AGENTS.md` lean. One fact, one home — no duplication.

Report a short diff summary of which docs you touched and why.
