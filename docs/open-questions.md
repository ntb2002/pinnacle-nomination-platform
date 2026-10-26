# Open questions for CCE

Every value and decision the platform needs the Pinnacle Awards program team (Syracuse University CCE) to confirm before launch. Dates and fees can be changed by an admin at any time in **Admin → Dates and fees** (`/admin/settings`). Every change is audited, and none needs a deploy. The seed and new cycles start from `src/lib/program-defaults.ts`.

Status key: **Given** means CCE stated it. **Placeholder** means we chose it and CCE must confirm.

## Dates (2027 cycle, Eastern time)

| Value | Current setting | Status | Notes |
|---|---|---|---|
| Nominations open | Tue Jan 26, 2027, 9:00 a.m. | Given (date), Placeholder (time) | Is 9:00 a.m. the right opening time? |
| Early-fee deadline | Tue Feb 9, 2027, 11:59 p.m. | Placeholder | Last day at the early fee. |
| Regular-fee deadline | Tue Feb 23, 2027, 11:59 p.m. | Placeholder | Last day at the regular fee; the late fee applies after it. |
| Final deadline (nominations close) | Sat Mar 6, 2027, 11:59 p.m. | Given | A Saturday: confirm a weekend close is intended. |
| Round one judging | Tue Mar 9 – Sat Mar 27, 2027 | Given | Shown on the public site. Admins still open and close round one by hand on **Judging**; the dates are not enforced automatically. |
| Finalist announcement | not set | Open | Needed for public copy and for the finalist package fee deadline (#13). |
| Round two judging, winners' embargo and publication | not set | Open | Needed for #14 and #15. |

The early/regular split creates three fee tiers within a six-week window. If CCE wants fewer tiers, set the deadlines accordingly (the tiers must stay in order).

## Fees (US dollars, per entry)

| Value | Current setting | Status |
|---|---|---|
| Early fee | $500 | Placeholder |
| Regular fee | $650 | Placeholder |
| Late fee | $800 | Placeholder |
| Finalist package fee | $1,500 | Placeholder |

Questions:
- Is the finalist package fee required for round two? The COI policy page and the finalist email currently say so.
- Are any categories priced differently? The platform supports one price per tier for all categories.
- What is the refund and withdrawal policy? Refunds are made by CCE finance in the Stripe dashboard; the app has no refund button. The fees page has no refund wording yet.

## Payments

- **Processor:** Stripe hosted Checkout. Is Stripe approved as the university's payment processor, and whose Stripe account is used (CCE, or a university merchant account)?
- **Accounts and keys:** live keys are set only in the production environment. A test-mode account is needed to complete the real-Stripe check (`README.md` → *Testing payments with Stripe test keys*).
- **Statement descriptor and receipt sender name:** what should appear on card statements and receipt emails?

## Email

- `EMAIL_FROM`: the sending address and name (for example "Pinnacle Awards <pinnacle@…syr.edu>"), plus its SPF/DKIM setup with Syracuse IT.
- `ADMIN_NOTIFY_EMAIL`: the shared CCE mailbox for resubmission notices. If unset, every admin account is emailed.
- The SMTP relay (`SMTP_URL`, which must be `smtps://` in production).
- Who checks **Admin → Emails** for undelivered mail, and how often?

## Program content and policy

- Category names and descriptions (all `TODO(copy)`), and which optional categories run in 2027.
- Rubric weights per category group. The default is Impact 40, Innovation 20, Influence 20, References 20; the weights lock when round one opens.
- Number of finalists per category. The admin picks 3 to 5 at selection; the default is 5.
- Home page thesis and claims, including the "first academically credentialed" claim, which needs substantiating.
- Methodology wording, the fees page, and the conflict-of-interest policy (the 3-year lookback and the finalist-package requirement for round two). These need CCE and counsel sign-off.
- The "I am CCE staff nominating someone" relationship is self-declared. Should it be restricted to admin accounts?
- Nominators whose entries are still in eligibility review when round one opens: what should they be told, and should they get an email? (#12)
- Should judges be notified when round one is reopened? (#12)

## IT and hosting (Syracuse IT)

- Hosting, the domain, and HSTS scope: should it include `includeSubDomains` / `preload`?
- Admin and judge sign-in: NetID SSO is deferred (LAUNCH_READINESS). Is email magic-link sign-in acceptable for launch?
- File malware scanning before judges download supporting files.
