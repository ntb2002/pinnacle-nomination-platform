---
name: spec
description: Spec work at any size. A project gets a breakdown into issues; a thin issue gets its issue spec; a specified Deep-lane issue gets its build plan. Writes, never builds, never moves status.
disable-model-invocation: true
---

# /spec $ARGUMENTS

One ritual. The argument, and the state of the issue, decide what it produces:

| You run | The issue is | It produces |
|---|---|---|
| `/spec <project>` | — (not yet broken down) | a **breakdown**: the project split into session-sized issues |
| `/spec <project>` | — (already broken down) | an **issue spec** for each of the next one or two thin issues whose blockers have all merged |
| `/spec <issue-id>` | thin (no criteria / gate / lane) | an **issue spec** written into the issue; if it comes out `deep` with no open questions, **its build plan too, in the same run** |
| `/spec <issue-id>` | specified, `lane: deep`, no plan yet | a **build plan** on the issue's branch (after folding any answered questions) |
| `/spec <issue-id>` | specified, `lane: standard` | nothing: say "no plan needed; `/build <id>`" and stop |

Issue ids look like `SS-42`, `NV-7`, `#42`, or a bare `42` on the GitHub tier.

Every `/spec <issue-id>` run starts with **Folding answered questions** below, so you never stop on questions the human has already answered.

**Not the tool's plan mode.** This skill writes files and pushes a branch, so run it in a normal session. If you find yourself in a read-only plan mode, say so and ask the human to switch modes rather than proposing the steps.

Every mode shares the rules: **your only deliverable is the spec** (issues, an issue spec, or a build plan). Do not implement anything. Do not change any issue's status — a human accepts, promotes, and approves. Read the tracker `AGENTS.md` declares (Linear MCP, or `gh`) and no other; if it is unreachable, stop and say so. Never read the knowledge layer (Notion, strategy docs, chat exports) to infer product intent — the tracker and `VISION.md` are the whole spec.

## Breakdown: split a project into issues

The strong-model step whose cost is amortized across many cheap execution units. Design coherence matters because nothing exists yet — think through the whole decomposition, but write down only what will still be true when each issue is picked up.

1. Read `VISION.md`, `AGENTS.md`, `docs/architecture.md`, `DECISIONS.md`, and the project's description in the tracker. If the outcome is unclear or violates the scope fence in `VISION.md`, stop and say so.
2. Decompose into **session-sized issues**: each buildable in one agent session and shippable as one PR. Sub-issues only when each child is itself session-sized. Identify **milestones** (user-visible capability checkpoints, not technical layers) and which issues are parallel-safe vs strictly serial.
3. **Fully specify only the first one or two issues** — the ones a human could promote to Todo today: acceptance criteria, entry dependency, a **verification gate** where every item is tagged `[CI]` / `[ARTIFACT]` / `[MANUAL]` and is phone-checkable (only tag `[CI]` if the check exists; only tag `[ARTIFACT]` if a tool the agent has can produce it), a **Model:** tier line per `.cursor/rules/model-policy.mdc`, and a **Lane:** line (`standard` or `deep`, one clause of reasoning; per `PLAYBOOK.md` → *Proportional rigor*), each mirrored as a `tier` / `lane` label. Name the protected checks the gate relies on. If the work is about improving a number rather than passing once, write a `## Loop spec` (template in `plans/README.md`). Its verifier must already exist, or be the issue before it.
4. **Leave the rest thin**: a title that names the work, one line of intent, milestone, `blocked by` links. **No acceptance criteria, no `lane` or `tier` label** — those are judgments about a spec, and a thin issue has none yet. Issue spec writes them against the code as it exists once the issue's blockers have merged. A greenfield decomposition is wrong by the fourth unit; don't pretend otherwise.
5. Open product calls go under `## Needs human` on the issue (numbered, with a recommendation each). Don't resolve them yourself.
6. File the issues into the project (Linear MCP, or `gh issue create` with the milestone). **Titles name the work** — no ids, codes, or team prefixes in the title.
7. Phase-level design that fits no issue (architecture sketch, sequencing rationale) → `plans/<project>/README.md`. Short. Design notes, not a unit list.
8. Log expensive-to-reverse decisions in `DECISIONS.md`. Update the `AGENTS.md` landing pad's *Active project* line.

Stop. Summarize milestones and sequence, list the issues you filed (ids + titles), and name the one you'd promote to Todo first. The human presses the keys.

## Folding answered questions (first, on every `/spec <issue-id>`)

If the issue has a `## Needs human` section, read the issue's comments:

- **Every item has a human reply** (a person's comment, not an agent's): fold them. Replace `## Needs human` with `## Decided`, one line per item stating the answer. Update any acceptance criteria, gate items, or Loop spec the answers change. Resolve the comment threads and comment on the issue that you folded them. Then continue.
- **Any item is unanswered:** stop and list exactly which ones. Don't fold a partial set, and never infer an answer from silence, a recommendation, or an earlier chat.

## Issue spec: turn one thin issue into a buildable issue

For an issue that is still thin (title, one-line intent, `blocked by`). This is where "thin issues get their criteria when they approach Todo" actually happens.

1. Read the issue, its comments, and the issues it was `blocked by`. If any blocker isn't merged, stop and say which: the spec would be written against code that doesn't exist yet.
2. Read `VISION.md` (scope fence), `AGENTS.md`, `docs/architecture.md`, `DECISIONS.md`, and **the code as it exists now**, especially what the merged blockers built. The spec is grounded in that, not in the original decomposition.
3. If it's no longer session-sized, say so and propose the split (sub-issues, each itself session-sized). Don't spec an oversized issue.
4. Write into the issue description: acceptance criteria, entry dependency, the **verification gate** (`[CI]` / `[ARTIFACT]` / `[MANUAL]`, only tiers a tool can actually produce), **protected checks**, a **Model:** line and a **Lane:** line, each with one clause of reasoning, and a `## Loop spec` if it's a loop issue. Apply the matching `tier` and `lane` labels. Keep the original one-line intent at the top.
5. Product calls you can't resolve from the code and `VISION.md` go under `## Needs human` (numbered, a recommendation each). Don't decide them.
6. Decide whether to continue:
   - **`lane: standard`:** stop. Report the spec in brief, its lane and tier.
   - **`lane: deep` and no `## Needs human`:** go straight on to **Build plan** below in this same run. You've just read the code, so the plan is nearly free now, and the human reviews the spec and the plan together.
   - **Any `## Needs human` open:** stop. The plan depends on the answers. Report the questions. Once the human answers in comments, the next `/spec <issue-id>` folds them and writes the plan.

   Don't change status. **The human promoting it to Todo approves the spec** (and the plan, when one was written in the same run).

## Build plan: expand one specified Deep-lane issue

**Deep lane only.** Standard-lane issues don't get a plan file — the issue is the spec and `/start-unit` reads it directly. Use this when the issue is ambiguous, risky, cross-cutting, `strong` tier, or touches prompts, safety, schema, or auth. If the issue turns out to be Standard-lane, say so and stop; don't write a plan nobody needs.

1. Read the issue — title, description, acceptance criteria, comments (Linear MCP `get_issue`, or `gh issue view <n> --comments`). Answered questions were already folded at the start of the run. If acceptance criteria are missing or ambiguous, **stop and say what's missing**. If a plan branch `origin/<issue-id>-<slug>` already exists, don't write a second plan: link it, and revise it only if the human asked for changes in comments.
2. Read `VISION.md` (scope fence), `AGENTS.md`, `docs/architecture.md` for the area, `DECISIONS.md`, and the code the issue touches. If the issue violates the scope fence, stop and flag it.
3. Decide size. If this is genuinely a subsystem (several PRs, several sessions), say so and recommend converting it to a tracker project and running `/spec <project>` — do not cram it into one unit.
4. **Put the plan on the issue's branch** so every agent (local or cloud) that builds the issue finds it. `git status` must be clean (otherwise stop and ask). `git fetch origin && git checkout --no-track -b <issue-id>-<slug> origin/main`. Then write `plans/features/<issue-id>-<slug>.md`. Don't restate the issue; link it and add what the code tells you:
   - **Issue:** id + link. **Entry dependency:** what must already be true (merged PRs, migrations, config).
   - **Why this now:** one or two lines tying it to the acceptance criteria.
   - **The concrete work:** files/areas to touch, the approach, what NOT to touch.
   - **Verification gate:** every acceptance criterion becomes at least one gate item tagged `[CI]` / `[ARTIFACT]` / `[MANUAL]`, phone-checkable.
   - **Branch:** `<issue-id>-<slug>` so the tracker auto-links the PR and closes the issue on merge.
   - **Model (for the build):** re-rate it now that the plan exists (`.cursor/rules/model-policy.mdc` → *A Deep-lane plan re-rates its build*). If this plan leaves the builder no judgment calls, say `mid`, even for schema or data-model work. **Auth, safety behavior, and prompts that ship to users stay `strong`.** One clause of reasoning. Update the issue's `tier` label to match.
   - **Protected checks:** the existing tests, evals, or fixtures the gate relies on. The executor may not edit them. Override any default loop bound here if the issue needs it.
   - **Loop spec** *(loop issues only)*: per `plans/README.md`. The verifier must already be merged.
5. Log expensive-to-reverse decisions in `DECISIONS.md`.
6. Update the `AGENTS.md` landing pad's *Next unit* line to this issue if it is now the top of the queue.
7. Commit the plan (and any `DECISIONS.md` / landing-pad edits) on that branch, `git push -u origin HEAD`, and comment on the issue with a link to the plan file on the branch. **Don't open a PR.** The unit's PR opens when it's built, and `/close-unit` deletes the plan file in it.

Stop. Summarize the gate and flag anything the issue left undecided. The human reviews the plan from the link (together with the issue spec, when both were written in one run). Changes are requested as comments on the issue, and you revise the plan on the same branch. **Approval is the human starting the build:** `/build <issue-id>` or `/start-unit <issue-id>`, or `@Cursor /build <issue-id>` for a cloud agent. It resumes this branch.
