@AGENTS.md

## Claude Code

- **Subagents:** `.claude/agents/` (`code-review`; `evaluator` for browser products). Call them without asking. Keep aligned with `AGENTS.md`.
- **Skills:** `.agents/skills/` (project rituals: `/spec`, `/build`, `/start-unit`, `/close-unit`, `/context-sync`). A `.claude/skills` symlink points here.
- **Permissions:** `.claude/settings.json` is the deny list for protected checks (CI config, hooks, `evals/`, verifier paths) and pre-approves routine git/`gh`/test commands. It sets no `defaultMode`, so sessions start in Claude Code's default. See `AGENTS.md` → *Autonomy inside the box*.
- **Hooks:** enable the git pre-commit hook once per clone: `git config core.hooksPath .githooks`. Cloud VMs: `.cursor/environment.json` runs this on install.
