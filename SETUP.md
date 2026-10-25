# Per-project setup checklist

The **tracker** section runs at bootstrap — a repo on the playbook has its tracker from the first commit. The hardening sections (GitHub, cloud agents) run when the codebase can break. The **earned machinery** sections are optional and gated by trigger, not by launch (`PLAYBOOK.md` → *Earned machinery*). Below-the-line repos (throwaway scripts) skip this file entirely.

## The venture cell (once per venture, ~30 min)

A venture is more than its repo. Every venture in the portfolio gets the same small set of homes, so adding venture N never means rebuilding the operating system. One authoritative source per kind of fact — no duplicates.

- [ ] **Repo(s)** — scaffolded by `bootstrap.sh`; `AGENTS.md` owns conventions and declares the tracker, `plans/features/` holds Deep-lane specs in flight.
- [ ] **Knowledge hub page** (Notion or equivalent) — thesis, decisions-and-why, thinking docs. Holds *strategy*, never engineering status; it links the active tracker project for that. **Execution agents don't read it** — its ideas reach code as tracker issues (drafted by you, a co-founder, or an agent with the Linear connector; approved by you) and the one-page `VISION.md` you curate.
- [ ] **Status row** in the portfolio status database — current state / next action / blockers / last-updated. This is what a daily pull or staleness check reads.
- [ ] **Tracker team** (Linear) — set up **at bootstrap**, see *Tracker* below. One team per venture, subject to plan limits.
- [ ] **Slack channel** — `#<venture>-dev` (PRs, CI, automation summaries). Subscribe the repo; start with just this one channel.
- [ ] **Coordinator** (Cursor Project) — **off by default**; one per repo when its trigger fires. See *Earned machinery*.
- [ ] Dormant ventures get only the first three. Don't build the rest until there's code.

Solo tools, MCP servers, and open-source repos are not ventures: they get the repo and the GitHub-tier tracker, and nothing else from this list.

## Tracker (at bootstrap)

Doctrine: `PLAYBOOK.md` → *Organizing work*. Declare the choice in the `AGENTS.md` landing pad; `bootstrap.sh --tracker linear|github` fills the placeholder.

**GitHub Issues (solo tier):**

- [ ] Enable Issues on the repo. Create labels `accepted` (= Backlog) and `ready` (= Todo); open + unlabeled is Triage. Create labels `feature` / `bug` / `improvement` and the `model` group (`fast` / `mid` / `strong`).
- [ ] Milestones are for user-visible checkpoints only; a "phase" is a milestone here.
- [ ] Agents read with `gh issue view <n> --comments` and file with `gh issue create`. PR bodies say `Closes #n`; branches are `<n>-<slug>`.
- [ ] Two human clicks are label changes: add `accepted`, then `ready`. Agents don't touch those labels.

**Linear (once per workspace, then per venture):**

- [ ] **One workspace for the portfolio; one team per venture** (e.g. `SS`, `NV`), venture-neutral workspace name. Not one workspace per venture: Cursor's Linear integration connects **one Linear workspace per Cursor account** (a second connection disconnects the first), so separate workspaces means only one venture gets issue → Cursor delegation. Route to the right repo with `repo=owner/name` labels on each team's projects (Cursor resolves `[repo=…]` in text → issue label → project label → dashboard default); team-scoped ids (`SS-42`, `NV-7`) carry the venture into branch names and PR titles. Split a venture into its own workspace only when it has its own team and billing. **Plan limits:** free tier is unlimited members, **2 teams**, 250 non-archived issues workspace-wide (Done/Canceled count until archived — shorten auto-archive in team settings); Basic removes the cap and allows 5 teams. A third venture on the free tier means upgrading or using the GitHub tier.
- [ ] Skip cycles until there are two weeks of velocity to plan against. Use a **project** per body of work (e.g. "Tester-Ready", "MVP") — a phase is a project; add milestones for user-visible checkpoints.
- [ ] Connect GitHub (Linear settings → Integrations → GitHub): PRs auto-link when the branch name or PR title contains the issue id (`SS-42`); issues move to In Progress on PR open and Done on merge. **Linear Reviews** (sidebar → Reviews) is the same GitHub PRs, in Linear — squash-and-merge from there is a GitHub merge. Merge from Linear *or* GitHub; git still lives on GitHub. Docs-only PRs must not put live issue ids in the title (a mapping table in the body is fine) — Linear will otherwise attach those issues, move them In Progress, and show them as "Resolves".
- [ ] **Use all three states.** Triage = inbox (agents, integrations, non-team members; trend to empty). Backlog = accepted, not scheduled. Todo = the build queue — approved *and* specified; agents pull only from here. Two human clicks: accept out of Triage, promote into Todo. Linear's Triage view has one-key accept / decline / duplicate / snooze for the first click. `/spec <project>` batch-fills Triage; multi-select and accept.
- [ ] **Titles name the work.** Id, project, labels, and priority stay as fields. Don't prefix titles with plan-file codes (`TR-00 ·`) or team keys.
- [ ] Issue drafts that need a product call use a `## Needs human` heading. Humans answer in a comment; an agent folds the answers into `## Decided` in the description before the issue is promoted to Todo. Such issues can wait in Backlog. Don't rewrite the whole issue by hand, and don't leave the decision only in a chat prompt.
- [ ] **Linear MCP on every agent surface — day-one floor, not optional.** The issue is the spec, so an agent that can't fetch it can't build. Cursor (project or user `mcp.json`), Claude Code (`claude mcp add --transport http linear-server https://mcp.linear.app/mcp`, then `/mcp` to authenticate), and the Cloud Agents MCP set for cloud/Remote Control workers. `/start-unit` stops if it can't fetch the issue.
- [ ] Connect Cursor: cursor.com/dashboard/integrations → Linear → authorize the workspace and team. Then Dashboard → Cloud Agents: set this repo as the default (or add a `repo=owner/name` label per team), confirm GitHub is connected and usage-based pricing is on — delegation won't fire without it. Each human who delegates links their own Cursor account the first time.
- [ ] Add members: co-founders write ideas into **Triage** in plain English — one line, zero ceremony. Anything that needs real thinking gets a knowledge-hub doc the issue links to, so domain work visibly sits upstream of engineering.
- [ ] Let agents work Triage: an agent with the Linear connector (a Claude project, Grok Bot, a coordinator if one exists) expands one-liners into draft acceptance criteria, dedupes, labels, and proposes priority. Agents never change status by hand (except Todo → In Progress when you start `/build` or `/start-unit` on that issue, and the Fast lane) — accepting out of Triage and promoting into Todo are human clicks, even when the agent is talking to you and you've just said "sounds good"; In Progress / Done come from the PR. An agent that thinks issues are ready lists them and asks you to press the key. Keep Triage enabled on every team for this reason.
- [ ] The `AGENTS.md` landing pad's *Tracker* line links the team; *Active project* names the current project. No engineering status on the venture's knowledge hub page — it links Linear.

**Delegating from Linear:** assign an issue to **Cursor** (assignee menu) or `@Cursor <instructions>` in a comment → a cloud agent works the repo and returns a PR, with progress posted back on the issue. Carry the model tier explicitly: `@Cursor /build SS-42 [model=<id>]` (point it at `plans/features/SS-42-<slug>.md` if Deep lane). The issue's **Model:** line says which tier (for a Deep-lane issue, the plan's Model line wins; it may be lower); the dashboard default is a fallback, not the mechanism. Good for small, well-specified issues. Cross-cutting or safety-critical work: drive it yourself with the strongest model, or let the coordinator dispatch it with the strong tier. Delegating more than one at a time is the coordinator trigger — see below.

## Local (per clone / per machine)

- [ ] `.claude/settings.json` (shipped by bootstrap): add this repo's test/build commands to `allow`, and every protected verifier path outside `evals/` to `deny`. Don't add `defaultMode`.
- [ ] `git config core.hooksPath .githooks` — enable the pre-commit hook (secret-scan + lint/test). Bootstrap sets this automatically; cloud VMs use `.cursor/environment.json`.
- [ ] Confirm the hook fires: a commit with a fake `sk-ant-…` or `sk-proj-…` string in a staged file should be blocked. If `gitleaks` is installed locally, the hook uses it automatically.

## GitHub (once per repo)

- [ ] Push the repo to GitHub; confirm CI runs on the first PR.
- [ ] **Settings → General → Pull Requests:** enable *Automatically delete head branches*. Linear (and GitHub mobile) have no delete-branch control after merge; this is the one click that keeps the remote clean without opening GitHub. Already on for SmartSport.
- [ ] **Settings → Branches → Add ruleset** for `main`: require a PR, require the CI status check, require up-to-date branches.
  - ⚠️ **Free + private repo:** GitHub won't *enforce* rulesets (wants Team/Pro). Not a blocker — CI still runs and shows on every PR; you keep the branch→PR→merge discipline, you just lose the hard block. For free hard enforcement, **make the repo public** (also good for a portfolio); or **GitHub Pro** (~$4/mo) protects private branches. Defer until others can merge or real users exist.
- [ ] **Settings → Code security:** enable Secret scanning + Push protection.

## Cloud agents (Cursor / Claude Code)

- [ ] `.cursor/environment.json` runs `git config core.hooksPath .githooks` on install — fresh VMs enable the hook automatically. Add stack-specific install steps there as the project matures: the `install` step is what Cursor's *Builds* pre-bake, so anything preparable ahead of time (dependency install, hook enable) belongs in `install`, and only things that must be fresh per session belong in `start`. Enable Builds in Dashboard → Cloud Agents → the environment → Builds tab.
- [ ] Confirm the agent can `gh pr create` (auth available in the environment).
- [ ] `.cursor/hooks.json` fires in cloud agents too — confirm the commit guard blocks a `git commit` on `main` from a cloud run once.
- [ ] (If Codex is used for overflow) its environment runs `git config core.hooksPath .githooks`; confirm the pre-commit hook fires there once before trusting a Codex commit. Codex reads `AGENTS.md` natively but not the scoped `.mdc` rules. It is overflow and second-opinion review only — see `docs/surfaces.md`.
- [ ] **Artifacts in PRs:** Dashboard → Cloud Agents → *Allow posting artifacts to GitHub*. On, the agent's screenshots/recordings embed in the PR description via long unguessable **public** URLs (GitHub's image proxy can't read private repos; this is the only way they render inline). Decide per venture: fine for a training app's UI; think twice where screenshots could show a customer's data (e.g. an architect's drawings) — off means you review artifacts in the Cursor agent view instead. Only applies to PRs the cloud agent opened; local-lane evidence follows `plans/README.md` (commit + link + tracker attachment).

## Earned machinery (optional — each by trigger, never by launch)

Doctrine: `PLAYBOOK.md` → *Earned machinery*. A new project has all three **off**. Turn one on only when its trigger fires; a stale automation or an idle coordinator is worse than none.

**Coordinator — Cursor Project (one per repo). Trigger: Todo regularly holds more ready issues than you can hold in your head, or you're delegating several issues a week to cloud agents.**

- [ ] Create a Project (Cursor left nav → Projects). Name it for the body of work (e.g. `<Venture> — engineering`).
- [ ] First message: point it at `AGENTS.md`, `PLAYBOOK.md`'s coordinator rules, and `docs/coordinator.md` in this repo. Tell it to run the loop in that brief and nothing else.
- [ ] Subscriptions: its own PRs (default — it fixes CI and addresses bot comments); Linear *status → Ready* (or whichever status means "approved to build"). Optionally the venture's Slack channel for bug reports.
- [ ] Review **every** PR it produces for the first two weeks. Add an issue class to *Delegated approval* in `docs/coordinator.md` only after it has produced several clean PRs of that class. Remove it the first time one is wrong.
- [ ] Watch the usage meter for the first week — Projects run on cloud-agent allowance and pricing is still settling (beta).
- [ ] Rule: one coordinator per repo. A personal ops agent (Grok Bot) files a Linear issue; it does not dispatch coding agents at this repo directly.

**Automations (dashboard → Automations, or `/automate` in Cursor). Trigger: a manual ritual has run the same way ~5 times and you're re-typing the same prompt.**

- [ ] `pr-review` — trigger *PR opened*; prompt from `.cursor/automations/pr-review.md`. Post to the venture's Slack channel. Start here; it's the read-only `code-review` subagent running without you.
- [ ] Add *CI failure triage* and *autofix review comments* only after `pr-review` has earned trust (see the bottom of that file).
- [ ] A scheduled *staleness check* is the repo-side half of "notice when something stops." Pair it with a knowledge-layer check on the portfolio status database.

**Bot reviewer / supervisor (Bugbot, CodeRabbit, Grok Bot). Trigger: PR volume means you're skimming reviews instead of reading them.**

- [ ] Bot reviewer on PRs: Cursor Bugbot or CodeRabbit. It reads the diff against `AGENTS.md`; you still read the gate.
- [ ] Supervisor (Grok Bot or equivalent): give it one job first — watch this repo's PRs, confirm every `[ARTIFACT]` gate has a real attachment, and message you when a PR is ready or when the evidence doesn't match the claim. Its memory is account-bound; anything durable it learns goes to the repo or the knowledge hub.

## Phone orchestration (Slack + GitHub mobile + Cursor iOS)

- [ ] Install the **GitHub app for Slack**; subscribe a channel to the repo: `/github subscribe <owner>/<repo> pulls checks`.
- [ ] Install **GitHub mobile**; turn on notifications for review requests + CI.
- [ ] Install **Cursor for iOS** (paid plan): launch cloud agents, watch them, review diffs/artifacts, merge. Turn on notifications so "ready for review" reaches your lock screen.
- [ ] **Local lane from the phone (Remote Control):** the agent loop runs in Cursor's cloud, tool calls run on your Mac. Start it from the **venture repo** chat so the workspace root, rules, and hooks are that repo's. **MCP does not come from the chat's `.cursor/mcp.json`** — it comes from the Cloud Agents MCP configuration, routed by transport (stdio servers start on your Mac, HTTP servers run on Cursor's backend). If a Remote Control run needs Xcode, add `xcrun mcpbridge` there as a stdio server first, then start a new run. Alternative that needs no laptop chat: start a named worker (`agent worker start --name <name>`) in the repo checkout and put `worker=<name>` in the Linear issue body or Slack message. Details and gotchas: `docs/surfaces.md` in the playbook.
- [ ] (If using Cursor cloud agents from Slack) connect the Cursor Slack integration so you can launch agents by message.
- [ ] Sanity check the loop: launch a trivial agent task → PR opens → Slack pings → review + merge from phone.

## iOS / Apple projects (Xcode 27+)

Once per machine:

- [ ] Select Xcode 27 under **Xcode → Settings → Locations → Command Line Tools** (older toolchains lack the `agent` tool). The MCP server itself works from Xcode 26.3+; only the skills need 27.
- [ ] Export Apple's seven agent skills and install them where both tools read them:

  ```bash
  xcrun agent skills export --output-dir ~/.agents/skills --replace-existing   # absolute path; Cursor reads ~/.agents/skills
  for s in ~/.agents/skills/*/; do n=$(basename "$s"); [ -e ~/.claude/skills/$n ] || ln -s "$s" ~/.claude/skills/$n; done   # Claude Code
  ```

  On Xcode 26.x the equivalent command (`xcrun mcpbridge run-agent skills export`) exists but reports "No skills available to export" — the bundles ship with 27.

- [ ] **Xcode → Settings → Intelligence:** turn on "Allow external agents to use Xcode tools."
- [ ] Register the Xcode MCP server in Claude Code: `claude mcp add --transport stdio xcode -- xcrun mcpbridge`

Per iOS repo (new repos: `bootstrap.sh <dir> "<Name>" "<one-liner>" --ios` does the first two automatically):

- [ ] Commit a **project-scoped** `.cursor/mcp.json` so Cursor gets the same tools **in this repo's chats**:

  ```json
  { "mcpServers": { "xcode": { "command": "xcrun", "args": ["mcpbridge"] } } }
  ```

  Keep it project-scoped on purpose. Putting Xcode in `~/.cursor/mcp.json` would attach it to every local chat (playbook, NOVA, …). You do not want that. This file covers **editor chats in this repo**. A Remote Control run gets its MCP from the Cloud Agents MCP configuration instead — add `xcrun mcpbridge` there as a stdio server (it runs on your Mac) when a phone-steered run needs simulator taps, with Xcode open on the project or headless `allow-folder` for this repo. Opening Xcode while an agent works in a different workspace does not leak the tools across.

- [ ] Add the iOS agent conventions to `AGENTS.md` (verify via Xcode MCP before claiming done; preview snapshots as `[ARTIFACT]`) — see `overlays/ios/AGENTS-ios.md` in the playbook.

- [ ] Know the constraints: the tools are **local-only** — cloud agents (`@Cursor` from Linear, Slack, or the iOS app's cloud lane) can't reach them, so they back `[ARTIFACT]` evidence, not `[CI]`. They need either Xcode open on the project **in this chat** (confirm `DeviceInteraction*` in the live tool catalog; on-disk descriptors are not enough), or **headless mode** (Xcode 27+, preview): `sudo xcrun mcp-server enable`, then `sudo xcrun mcp-server allow-folder <repo> --always`. Headless + a Remote Control run whose Cloud Agents MCP config includes `xcrun mcpbridge` (or a named `worker=` machine) is how iOS evidence gets produced from a phone. **Clamshell only works with WindowServer awake:** power + external display (classic clamshell). Lid shut and no display = GUI asleep = simulator/Device Interaction will hang or never attach, even if the agent process is still running. Never use `--unsafe-always-allow-all-agents`.
- [ ] Know what the tools cover — **verify with `tools/list`, the surface changed a lot between versions.** Xcode 26.x: 21 tools — build, tests, `RenderPreview`, snippets, docs. Xcode 27: 53 tools — adds `RunProject`/`StopProject`/`GetConsoleOutput`, `InvokeDebuggerCommand` (LLDB), `DeviceInteraction*` (boot simulator, install, synthesize taps, screenshot), `GetTopCrashIssues`/`GetCrashIssueLogs`, scheme/destination switching, build settings and entitlements editing, String Catalog tools.
- [ ] Upgrade gates accordingly. On 27+: build/test, preview renders, **and simulator tap-through flows with screenshots** are `[ARTIFACT]` (agent-attached). `[MANUAL]` shrinks to physical-device-only behavior, real payments/push, and subjective feel.
- [ ] Apple's skills (10 on Xcode 27: `swiftui-specialist`, `swiftui-whats-new-27`, `modernize-tests`, `uikit-app-modernization`, `adopt-c-bounds-safety`, `building-document-based-swiftui-applications`, `app-intents-specialist`, `app-intents-whats-new-27`, `device-interaction`, `audit-xcode-security-settings`). The knowledge skills work in any tool; `device-interaction` and `audit-xcode-security-settings` call Xcode MCP tools, so they work from Cursor/Claude Code **only when the Xcode MCP is connected**. Re-export with `--replace-existing` after each Xcode update.
- [ ] Xcode's own agent (plan mode, approve-before-build, ACP so Claude Code can run inside it, plugins that carry skills) is a specialist surface, not the daily driver: reach for it on pure-Swift UI units where you want the native plan/preview canvas. Cursor and Claude Code stay primary so every venture runs the same loop.

## Graduate when ready

- [ ] Dedicated secret scanning in CI (gitleaks) for defense-in-depth beyond push protection.
- [ ] Staging environment: `main` → staging; a tagged `release` → prod.
- [ ] Platform CI (e.g. macOS runners for iOS) once a test target exists.
