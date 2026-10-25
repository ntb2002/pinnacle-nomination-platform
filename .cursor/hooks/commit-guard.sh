#!/usr/bin/env bash
# Cursor beforeShellExecution guard for `git commit`: early secret backstop.
# Returns Cursor hook JSON. The authoritative full gate is .githooks/pre-commit.
set -uo pipefail
cat >/dev/null 2>&1 || true

root="$(cd "$(dirname "$0")/../.." && pwd)"

if msg="$("$root/scripts/hooks/secret-scan.sh" 2>&1)"; then
  echo '{"permission":"allow"}'
  exit 0
fi

agent_msg="$(printf '%s' "$msg" | jq -Rs .)"
printf '{"permission":"deny","user_message":"Commit blocked: a possible secret is in the staged changes.","agent_message":%s}\n' "$agent_msg"
exit 0
