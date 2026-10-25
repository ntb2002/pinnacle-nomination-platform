# Pinnacle Awards Platform — Product Vision

> The durable product thesis: what we're building, why, and for whom. Changes rarely. What's next lives in GitHub Issues; conventions live in `AGENTS.md`; `plans/` holds Deep-lane specs only.

## The one-liner

The nomination, payment and judging platform for the Pinnacle Awards, the first academically credentialed executive awards program for the creator economy, run by Syracuse University's Center for the Creator Economy (CCE).

## What it is

One web app that runs an awards cycle end to end:

- **Nominators** (self, peer, or CCE staff) submit structured entries for creator-economy executives: a 250-500 word narrative, 2-3 quantified outcomes, 1-2 references, optional supporting files. Each entry is one nominee in one category and is billed separately, at an entry fee that rises as deadlines pass (early $500, regular $650, late $800). Payment is Stripe hosted Checkout, so card data never touches our servers.
- **CCE admins** triage every paid entry (approve, or return for completeness or wrong category), configure deadlines, fees, categories and rubric weights, build the judging panel, run two judging rounds, break ties, and publish results.
- **Judges** are assigned per category and round, declare conflicts of interest, are recused where conflicted, and score assigned entries on a weighted rubric (Impact & Results 40%, Innovation 20%, Industry Influence 20%, Reference Validation 20%; weights configurable per category type).
- **The public** sees the published methodology, the named judging panel, the conflict-of-interest policy, the per-category finalist-rate disclosure, and, once an admin lifts the embargo, the winners.

Categories: 7 core (CEO of the Year, Innovator of the Year, Creator of the Year, Agent/Manager of the Year, Top Sales Leader, Top Strategist, Top Service Leader of the Year) plus up to 2 optional (Best Use of GenAI, Most Innovative Campaign of the Year).

Rounds: round one narrows each category to 3-5 finalists; finalists pay a configurable finalist package fee; round two picks one winner per category, with an admin tiebreak.

**Today (built):** see `docs/status.md`.

**Where it's heading:** nominations open **January 26, 2027**. Later cycles reuse the same app with new cycle settings.

## Why it exists

Executive awards in marketing and media (Ad Age A-List, Adweek Executive of the Year) carry weight because people trust how winners are chosen. The creator economy has no equivalent with academic standing. CCE can offer one, but only if the process is visibly fair and the platform feels as polished and trustworthy as the programs it competes with. A spreadsheet-and-form process cannot show that.

## The moat

**Credibility, made checkable.** A published methodology whose weights are the ones the software actually applies; a named panel; a conflict-of-interest policy the software enforces (recused judges cannot see or score an entry); an append-only audit trail of every admin and judge action; a public finalist-rate disclosure; winners embargoed until publication. The academic affiliation opens the door; the enforced process keeps it credible.

## Target market (sequenced)

1. **Now (v1):** the 2027 Pinnacle cycle — creator-economy executives, their peers and teams, CCE staff.
2. **Near:** repeat annual cycles; sponsor-facing reporting.
3. **Long-term:** other CCE or Newhouse recognition programs on the same engine.

**Architectural implications for today:** everything hangs off an award cycle record, so a new year is new data, not new code. Categories and rubric weights are data. Payment, storage and email sit behind interfaces so the university can swap the processor or host.

## What this is NOT

- Not a public voting or "people's choice" system.
- Not a CRM, ticketing or gala-seating system (the finalist package fee is collected; what it buys is fulfilled outside the app).
- Not a general-purpose form builder: the entry structure is fixed by the program rules.
- Not a place for real personal data in the repo: seed data is fake.

See `AGENTS.md` → *What we're explicitly NOT building*.
