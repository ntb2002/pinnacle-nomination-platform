#!/usr/bin/env bash
# Runs the same steps as docs/ci/ci.yml against a local Postgres.
# Usage: scripts/ci-local.sh [log-file]
# Needs: Node 24, Postgres with role pinnacle/pinnacle and databases
# pinnacle_test + pinnacle_e2e (see AGENTS.md → How to run).
set -euo pipefail

log="${1:-}"
if [ -n "$log" ]; then exec > >(tee "$log") 2>&1; fi

export CI=true NEXT_TELEMETRY_DISABLED=1
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://pinnacle:pinnacle@localhost:5432/pinnacle_test}"
export E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgresql://pinnacle:pinnacle@localhost:5432/pinnacle_e2e}"

step() { printf '\n==> %s\n' "$*"; }

echo "ci-local: $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD), node $(node --version)"
step "lint";          npm run -s lint
step "format:check";  npm run -s format:check
step "typecheck";     npm run -s typecheck
step "unit + integration tests"; npm test --silent
step "build";         NODE_ENV=production npm run -s build
step "e2e";           npm run -s test:e2e
printf '\nci-local: all steps passed\n'
