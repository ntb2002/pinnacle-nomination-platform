# Plans

> Deep-lane execution specs and optional project design notes. **In-repo on purpose** so they travel with every clone, device, and cloud agent. Cursor's `.plan.md` and Claude Code's todo list are ephemeral scratch — when a plan matters, it gets written here and committed. **This folder is never a work queue.** What's next lives in the tracker named in `AGENTS.md`.

## What lives here

- **`plans/features/<issue-id>-<slug>.md`** — one file per **Deep-lane** issue currently in flight, committed on **the issue's branch** (never on `main`), so local and cloud agents both find it. `/spec <issue-id>` cuts the branch from `origin/main`, commits the plan, pushes, and links it on the issue; `/build` or `/start-unit` resumes that branch; `/close-unit` deletes it in the PR that ships the unit (the PR body carries the full plan). Standard- and Fast-lane issues have no plan file: the issue is the spec.
- **`plans/<project>/README.md`** *(optional)* — phase-level design that doesn't fit an issue: an architecture sketch, sequencing rationale. `/spec <project>` may write it. Not a unit list; the units are issues in the tracker project.
- **`plans/artifacts/`** — committed local-lane evidence (small PNGs), linked by SHA from PR bodies.

1. **The roadmap is in the tracker.** `AGENTS.md`'s landing pad points at the active project and the next Todo issue; nothing here is a roadmap.
2. **Deep-lane work gets a plan first.** A strong model expands the approved issue into a gated unit here, **writes the plan and stops**; a human reviews before any execution.
3. **Fully specify only the next unit or two.** Later issues stay thin in the tracker (no criteria, no `lane`/`tier` label) until their blockers merge; then `/spec <issue-id>` specs them against the code as it is.
4. **Each unit has an entry dependency + a verification gate.** Execute one at a time (WIP limit in `AGENTS.md`): build → verify gate → update `docs/status.md` + landing pad → PR → next.
5. **Expensive-to-reverse decisions** get logged in `DECISIONS.md`.

## Verification gates (phone-checkable)

Tag each gate item by evidence tier:

- **[CI]** — a green check proves it. Best tier. Only tag `[CI]` if the check actually exists.
- **[ARTIFACT]** — screenshot / recording / log / curl output the reviewer can actually open from the PR or the tracker issue. Includes agent-captured evidence: build/test output, preview renders, simulator screenshots from a driven flow, console/debugger output via local tools (e.g. Xcode 27 MCP), browser screenshots/recordings from a cloud agent's VM. Only if the agent actually has the tool — and only if the evidence is placed where it renders (see below).
  For browser products, the `evaluator` subagent (`.claude/agents/evaluator.md`) is the default `[ARTIFACT]` path for UI units: it drives the running app against the acceptance criteria and returns `PASS` or the failed criterion with evidence.
- **[MANUAL]** — hands-on verification an agent genuinely can't do (physical-device-only behavior, real payments/push, subjective feel). Spell out exact steps + expected result.

Before tagging `[ARTIFACT]`, confirm a tool can actually produce that evidence — a gate item is worthless if it silently invites the agent to overclaim.

A unit is done only when every gate item is checked with evidence on the PR.

### Where evidence lives (and why images break)

PR bodies and tracker issues are comments, not repo files, so relative image paths 404. On a **private** repo GitHub's image proxy can't fetch repo images either, so `raw`/`blob?raw=true` embeds break too, and there is no API to upload to GitHub's drag-and-drop attachment host. Hence two lanes, chosen by where the agent ran:

| Lane | Who produces it | Where it goes | Where you look |
|---|---|---|---|
| **Local** (laptop, Remote Control; Xcode MCP, local browser) | agent on your Mac | PNG committed under `plans/artifacts/<issue-id>-<what>.png`; **linked** (not embedded) in the PR body by SHA-pinned blob URL; same file attached natively to the tracker issue | GitHub web/mobile while signed in; inline on the Linear issue (phone) |
| **Cloud** (Cursor cloud agent VM; web apps, browser flows) | agent on a Cursor VM | `/opt/cursor/artifacts/` → attached to the agent run; embedded in the PR description if *Allow posting artifacts to GitHub* is on (public unguessable URLs) | Cursor agent view (desktop/iOS), and the PR body |

Recordings (video) never go in git — cloud lane attaches them to the run/PR; local lane attaches them to the tracker issue. Keep committed PNGs small; if `plans/artifacts/` grows past a few tens of MB, sweep artifacts of long-shipped units (SHA-pinned links in old PRs keep working).

## Loop issues

When the goal is **improving a number** rather than passing once, the issue is a loop issue. It is modeled on Karpathy's `autoresearch`: a written loop spec plus a cheap verifier the agent cannot edit. Put this in the issue description:

```
## Loop spec
Mutable:      <files/dirs the agent may change>
Protected:    <verifier, eval set, fixtures — never edited>
Metric:       <single number + direction, e.g. export_fidelity ↑>
Run command:  <how one trial runs>
Budget:       <max trials / wall-clock / cost>
Keep rule:    <keep if metric improves by ≥ X, else revert>
Log:          <where each trial's result is recorded, e.g. plans/artifacts/<issue-id>-trials.tsv>
Stop when:    <target reached | budget spent | N trials without improvement>
Escalate:     loop bounds in AGENTS.md
```

- **Entry dependency: the protected verifier is already merged.** Build the scorer and fixtures in an earlier, ordinary issue. A loop issue can't build its own judge. Put them under `evals/` (already on the `.claude/settings.json` deny list). If they live elsewhere, that verifier issue adds its path to `deny`.
- A kept trial is a commit on the issue branch; a reverted trial is reset away. The log keeps every trial, kept or not.
- **Gate:** the trial log `[ARTIFACT]`, the final metric vs the stop condition, and a comparison table plus a recommendation. Any decision the loop informs (a library, an architecture) is made by the human in `DECISIONS.md`, not by the loop.
- Not loopable: taste and design quality. Those stay `[MANUAL]`.

**Worked example — geometry-kernel spike (NOVA)**

```
## Loop spec
Mutable:      spike/kernels/*
Protected:    spike/bench/ (fixture models + scorer)
Metric:       composite score ↑ — boolean/sweep success rate on curved fixtures;
              .3dm round-trip fidelity (layers + materials survive, re-read via rhino3dm);
              p95 operation latency in the browser
Candidates:   OpenCascade.js · a Rust→WASM kernel · mesh-only manifold-3d (baseline)
Run command:  <the bench script in spike/bench/>
Budget:       30 trials
Keep rule:    keep a candidate's change if its composite improves; else revert
Log:          plans/artifacts/<issue-id>-trials.tsv
Stop when:    a candidate clears the thresholds, or the budget is spent
Escalate:     loop bounds in AGENTS.md
```

Output: a comparison table and a recommendation. The kernel choice itself is a human decision in `DECISIONS.md`. The bench under `spike/bench/` ships first, as its own issue, and that issue adds `Edit(/spike/bench/**)` to the `.claude/settings.json` deny list. Other loop-shaped candidates: an export round-trip test; an eval pairing fixed design requests with the expected typed operations, where the loop improves the system prompt.

## What stays in the repo, and what doesn't

The tracker owns the roadmap, backlog, briefs, and delivery status. The repo owns what an agent needs *with the code open*: `AGENTS.md`, `VISION.md`, `DECISIONS.md`, `docs/architecture.md`, `docs/status.md` (code-side history), and the **open** Deep-lane units under `plans/features/`. A plan unit is the execution spec for one issue — file paths, approach, gate — and it lives here because cloud agents, the coordinator, and PR reviewers read the repo, not the tracker. It is deleted by `/close-unit` in the same PR that ships it; the PR body carries the full plan. Result: `plans/features/` never holds more than the units currently in flight, and the repo does not accumulate markdown.

## In flight

- `features/` — Deep-lane units currently being built (should match the tracker's In Progress, minus Standard/Fast-lane issues)
- <optional: `<project>/README.md` design notes for the active project>
