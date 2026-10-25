<!--
  Keep PRs small enough to review from a phone. One work unit per PR.
  Fill in evidence by tier so the reviewer confirms "structurally sound" fast.
-->

## What & why

<!-- 1–3 sentences. Link the tracker issue (the id is already in the title/branch). GitHub tier: add "Closes #n". -->

Issue:
Lane: <!-- fast / standard / deep. Deep: paste the full plan unit below; the file is deleted in this PR. -->
Decision log touched (DECISIONS.md):  <!-- entry # or "none" -->

## Verification gate

> Check every box and attach evidence. **[CI]** = a green check proves it · **[ARTIFACT]** = screenshot/recording/log/curl the reviewer can open (private repo: **link** the SHA-pinned blob, don't `![]` embed; see `plans/README.md`) · **[MANUAL]** = exact steps + expected result stated.

- [ ] **[CI]** Lint + tests green.
- [ ] **[ARTIFACT]** / **[MANUAL]** Each gate item from the issue (or Deep-lane plan) is satisfied (paste the gate checklist with evidence).
- [ ] No secrets added. Secret-scan passed.
- [ ] Docs updated: `docs/status.md` + `AGENTS.md` landing pad reflect this change.

## Evidence

<!-- Screenshots / recordings / curl output / CI summary.
     Local-lane images: [name](https://github.com/<owner>/<repo>/blob/<sha>/plans/artifacts/<file>.png) + attached on the tracker issue.
     Cloud-lane images: leave to Cursor's artifact pipeline. -->


## Notes for reviewer

<!-- Non-obvious bits, risks, follow-ups. -->
