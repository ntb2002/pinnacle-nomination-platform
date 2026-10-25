#!/usr/bin/env bash
# Lint + test the project when staged changes touch its code.
# Exit 0 = clean / not applicable, exit 1 = checks failed (caller should block).
# Escape hatch: SKIP_PROJECT_CHECK=1 git commit ...
#
# CUSTOMIZE per project: point the detection at your package dir(s) and commands.
# Default behavior auto-detects a Python (uv) or Node project at the repo root.
set -uo pipefail

[ "${SKIP_PROJECT_CHECK:-0}" = "1" ] && { echo "project-check: skipped (SKIP_PROJECT_CHECK=1)."; exit 0; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

repo_root="$(git rev-parse --show-toplevel)"
staged="$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)"
[ -z "$staged" ] && exit 0

cd "$repo_root" || exit 0

# --- Python (uv) ---
if [ -f pyproject.toml ] && command -v uv >/dev/null 2>&1; then
  echo "project-check: ruff + pytest"
  uv run ruff check . || { echo "project-check: ruff failed."; exit 1; }
  uv run pytest -q || { echo "project-check: tests failed (SKIP_PROJECT_CHECK=1 to bypass WIP)."; exit 1; }
  exit 0
fi

# --- Node ---
if [ -f package.json ] && command -v npm >/dev/null 2>&1; then
  if npm run | grep -qE '^  lint'; then npm run lint || { echo "project-check: lint failed."; exit 1; }; fi
  if npm run | grep -qE '^  test'; then npm test --silent || { echo "project-check: tests failed."; exit 1; }; fi
  exit 0
fi

echo "project-check: no recognized stack/tooling — skipping (customize project-check.sh)."
exit 0
