#!/usr/bin/env bash
# Block staged secrets before they ever land in git.
# Exit 0 = clean, exit 1 = secret found (caller should block the commit).
# Stack-agnostic — safe to use in any repo.
set -uo pipefail

# Not a git repo? nothing to scan.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Prefer gitleaks when available — professionally maintained ruleset.
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --no-banner
  exit $?
fi

fail=0
note() { echo "  - $1"; }

# 1) Never commit secret-bearing files by name.
staged_files="$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)"
if [ -n "$staged_files" ]; then
  while IFS= read -r f; do
    case "$f" in
      *.env|*/.env|*.env.*|*Secrets.xcconfig|*Secrets.plist|*secrets.json|*.secret.*|*.pem|*id_rsa)
        case "$f" in *.env.example|*.env.sample|*.env.template) continue;; esac
        if [ $fail -eq 0 ]; then echo "Secret-scan: blocked file(s):"; fi
        note "$f looks secret-bearing and must not be committed."
        fail=1 ;;
    esac
  done <<< "$staged_files"
fi

# 2) Scan added lines for secret value patterns.
added="$(git diff --cached -U0 --diff-filter=ACM 2>/dev/null | grep -E '^\+' | grep -Ev '^\+\+\+' || true)"
patterns='sb_secret_[A-Za-z0-9]|sk-ant-[A-Za-z0-9]|sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
hits="$(printf '%s\n' "$added" | grep -nE "$patterns" || true)"
if [ -n "$hits" ]; then
  if [ $fail -eq 0 ]; then echo "Secret-scan: blocked content:"; fi
  printf '%s\n' "$hits" | while IFS= read -r line; do note "$line"; done
  fail=1
fi

if [ $fail -ne 0 ]; then
  echo "Remove the secret(s), keep them in .env / a secrets manager (gitignored), then re-stage."
  exit 1
fi
exit 0
