# Git & GitHub workflow

> How code moves from an agent's edit to production, and how you review/orchestrate it from a phone. **`main` is sacred** — nothing reaches it except through a reviewed, CI-green PR.
>
> **v1 build (DECISIONS 002):** issue branches are cut from `origin/v1`, not `origin/main`, and the agent merges them into `v1` after the gate and both subagent reviews pass. `v1` reaches `main` through one human-reviewed PR. Everything below about branching from `origin/main` applies again after v1 ships.

## The four places code lives

```
Working Directory  →  Staging Area  →  Local commits  →  Remote (GitHub)
   (edits on disk)     (git add)        (git commit)       (git push)
```

A **commit** is a named snapshot. A **branch** is an independent line of commits. A **PR** proposes merging one branch into another (`your-branch → main`) with a diff, review, and CI.

## The unit of work: one issue = one branch = one PR

1. **Branch** off GitHub's `main`: `git fetch origin && git checkout --no-track -b <issue-id>-<slug> origin/main` (e.g. `SS-42-onboarding-copy`, or `42-onboarding-copy` on the GitHub tier). The id in the branch is what lets the tracker link the PR and close the issue on merge.
   > **Why `origin/main` and not `main`:** clicking *Merge* (GitHub web, GitHub mobile, Linear Reviews, `gh pr merge`) merges on GitHub's servers. Your local `main` doesn't change until something pulls, even when the browser is on the same laptop. A branch cut from a stale local `main` is missing merged work and will conflict with it or quietly undo it. `/start-unit` and `/close-unit` handle this; do the same by hand.
2. **Commit** as you go (the pre-commit hook runs if `core.hooksPath` is enabled).
3. **Push:** `git push -u origin HEAD`.
4. **Open a PR** with `gh pr create` using `.github/pull_request_template.md`; fill the gate checklist with evidence.
5. **CI runs on the PR** and reports green/red.
6. **Review → merge → branch deletes.** Deploy follows from `main`.

> A PR doesn't create the branch — the branch must exist and be pushed first. Tooling just runs branch→commit→push→PR in one motion.

**Never commit to `main`** — it deploys, and CI only runs on PRs/pushes. The PR is the airlock and the audit trail, even for your own local work. **No meaningful change merges without an issue**; a typo fix that gets a PR gets a Fast-lane issue too.

## Two layers of automated gates

| | Pre-commit hook (`.githooks/pre-commit`) | CI (`.github/workflows/ci.yml`) |
|---|---|---|
| Where / when | Local, at commit | GitHub servers, on push/PR |
| Bypassable? | Yes | No — can be *required* |
| Trust | Fast local courtesy | Authoritative gate |

A cloud agent on a fresh VM won't have the hook active unless its setup runs `git config core.hooksPath .githooks` — but it's *always* subject to CI. Never rely on the hook alone; mirror anything important in CI.

## One-time setup

```bash
git config core.hooksPath .githooks
```

Add that line to cloud-agent environment/setup scripts so fresh VMs enable the hook.

## Branch protection (once, on GitHub)

**Settings → Branches → Add ruleset** for `main`: require a PR, require the CI status check, require up-to-date branches. **Settings → Code security:** enable secret scanning + push protection. After this, no agent or human can merge failing or secret-bearing code.

## Orchestration — review & launch from anywhere

You review and decide, you don't hand-type code from your phone. Gates are tagged `[CI]` / `[ARTIFACT]` / `[MANUAL]` so review takes ~30 seconds (see `plans/README.md`).

- **Slack** — notifications (PR opened, CI pass/fail) + launching cloud agents.
- **GitHub mobile** — diff, CI check, gate checklist, merge.
- **Laptop / Cursor** — interactive work; cloud agents/worktrees for parallel *independent* units.
- Git is tool-agnostic: you, Cursor, and Claude Code all do branch→commit→push→PR and hit the same hook + CI.

## Graduate when ready (match ceremony to maturity)

| Tier | Git gets |
|---|---|
| Below the line (throwaway) | A repo and `AGENTS.md`. Commits to `main` are fine — there is no loop to protect. |
| On the playbook | branch → PR from the first commit, pre-commit hook, issue id in every branch name. |
| Codebase that can break | + **CI**, branch protection, push protection. |
| Real users / prod deploys | + dedicated **secret scanning** in CI (gitleaks), **staging environment** (`main` → staging, `release` → prod), platform-specific CI (e.g. macOS runners for iOS). |

A **bot reviewer** (Bugbot / CodeRabbit) is not a stage — turn it on when PR volume means you're skimming reviews instead of reading them (`PLAYBOOK.md` → *Earned machinery*).
