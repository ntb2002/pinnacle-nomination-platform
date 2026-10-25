---
name: build
description: Build one Todo issue end to end without stopping — start-unit, then close-unit — and deliver an open PR with gate evidence. Build mode; never merges.
disable-model-invocation: true
---

# /build $ARGUMENTS

**Build mode.** Take one issue (`$ARGUMENTS`, e.g. `NV-7`, or `#42` on the GitHub tier) from Todo to an open PR in one run. The human's approval already happened when they promoted the issue to Todo; their final check is the PR. Don't stop in between to ask whether to continue.

This skill has no steps of its own. It runs the two unit rituals back to back, so there is one source of truth:

1. **Read and follow `.agents/skills/start-unit/SKILL.md`** for `$ARGUMENTS`, every step: fetch the issue from the declared tracker, check Todo + entry dependency + WIP limit, branch from `origin/main`, build inside the box until the gate passes.
2. **When the gate passes, go straight on:** read and follow `.agents/skills/close-unit/SKILL.md` for the same issue, every step: evidence, status docs, merge `origin/main`, open the PR. Stop at the open PR.

## What build mode does not change

- **Same box, same edges** (`AGENTS.md` → *Autonomy inside the box*). Only an issue in Todo. Protected checks stay protected. Never merge.
- **Deep lane still needs its plan.** A Deep-lane issue's plan lives on its branch `origin/<issue-id>-<slug>`, written by `/spec <issue-id>`. If there's no such branch or plan file, stop and say so. Don't write the plan yourself. The human invoking `/build` on a planned issue *is* the plan approval. `/build` removes the pause between building and the PR, not the plan review.
- **Escalation still stops the run.** A loop bound, a `## Needs human` question, or a wanted change to a protected check → escalate per `AGENTS.md` and stop. Don't open a PR for a unit whose gate didn't pass. The pushed branch and the note on the issue are the output.
- **`[MANUAL]` gate items** can't be done by you. List them in the PR as unchecked boxes with exact steps and expected results; they are the human's final check. Don't claim them.

## After the PR

If the human comments on the PR asking for changes, fix them on the same branch, re-run the affected gate items, push, and reply on the thread. Iterating on an open PR is how build mode refines. Pair mode (`/start-unit` … `/close-unit`) refines before the PR instead.

Report the PR URL and the gate results, or the escalation note if you stopped.
