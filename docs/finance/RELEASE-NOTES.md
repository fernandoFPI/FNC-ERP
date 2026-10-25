# Finance currency fix — release notes

Squashed commit: `feat(finance): currency fix plan (D2, D10, Phase 2.1-2.5) + posting-account settings UI (G1/G2)`.
No currency is ever summed, compared or converted across a different
`currency_code` anywhere in Finance after this release; every total is
per-currency, and "no data in this currency" is shown as such rather than
a blended guess.

**For the Oct 15 "FNC Finance Pipelines" audit's 39 findings (G1-G32,
C1-C7)**: see `docs/finance/gap-status.md` for the full, evidenced status
of every one. This document only describes what this release itself
changes; it does not repeat or summarize that table.

## What users will see change

- **Purchase orders**: a PO whose lines span more than one currency no
  longer shows a single (wrong) total — `subtotal`/`total_amount` are
  blank for that PO instead of a blended number (D10).
- **Reports**: Trial Balance, Profit & Loss, Balance Sheet, Consolidated
  reports, AP/AR dashboards, WHT Payable, Payroll Tax Report, Cash Flow,
  and the executive dashboard all show one figure per currency instead of
  one blended figure. A currency with no activity for a given report
  simply doesn't show a row/card for it.
- **Project budgets**: a project can now hold a budget in more than one
  currency (project_budgets). The existing single "Budget Amount" field
  on Edit Project still works exactly as before for the normal
  single-currency case — it's now backed by a per-currency row rather
  than the old single column. A currency with real cost but no budget set
  shows "No budget set" instead of a margin compared against a different
  currency's budget. A small "+ Add Currency Budget" control appears on
  the project page for the rare case of a second currency.
- **GL Budgets vs Actual**: the same rule — a budget only compares
  against actual activity in its own currency; other-currency activity
  shows in a separate "Outside Budget Currency" section, raw, never
  converted.
- **FX Revaluation**: the screen, its sidebar entry and its routes are
  gone. Nothing is converted anywhere anymore, so there's nothing left to
  revalue. (Its tables and backend code are untouched on disk, for a
  later release that drops them properly.)
- **Project-detail cost summary** and the **executive dashboard's**
  project-budget total now read the real per-currency data instead of a
  single blended number.

## REQUIRED right after deploy

**Seed the posting-account map for all three companies, in the new
Settings screen, before anyone approves a vendor invoice or payment, a
project or rental invoice, or a payroll run.**

`company_posting_accounts` (migration 303, G1/G2 — already merged before
this release) is what every automated journal producer now resolves a GL
account through, instead of guessing one by an old chart-code prefix: the
worker and gateway call `resolvePostingAccount(companyId, role)` and
**throw `POSTING_ACCOUNT_NOT_CONFIGURED: <role>`** the moment a role has
no account configured for that company. Until every role below has a
row, the matching document types fail to post with that error on every
attempt (visible in the Outbox Monitor as a stuck/failed event).

**This release adds the missing piece**: Finance → Journals & Accounts →
**Posting Accounts** (`finance.accounts.edit`). One row per role, a
default account picker (limited to active, postable accounts) plus
optional per-currency overrides, a "Not configured" marker on anything
missing, and a read-only readiness summary at the top. **Switch to each
of the three companies in turn and open this screen; the readiness panel
must show "All roles configured" for each one** before relying on
automated posting for that company. The 18 roles:

```
ar, ap, revenue_project, revenue_rental, expense_default, cash,
retention_receivable, retention_payable,
wht_recoverable, wht_payable, wht_expense,
salaries_payable, payroll_tax_payable,
grni, stock_variance,
interco_receivable, interco_payable,
inventory
```

A currency-specific override is optional per role (shown as its own row
under "Currency Overrides"); a role only counts as configured in the
readiness panel once it has a company-wide default (a role with only
currency-specific overrides and no default is flagged in `missingRoles`
even though some currencies would resolve — the readiness panel's job is
catching the gap before it's hit live, not declaring partial coverage
good enough).

## Migrations, in run order

Apply with `pnpm migrate` against `fnc_erp_dev` **and** `pnpm migrate`
with `DATABASE_URL` pointed at `fnc_erp_test` (both, per the project's own
gotcha — `pnpm migrate` only hits dev by default), then the same sequence
in production via the normal deploy pipeline:

1. **305_project_profitability_per_currency.sql** — rewrites
   `v_project_profitability` on top of `v_project_cost_by_currency`
   (migration 304, already on origin/dev): one row per (project,
   currency) with real activity, instead of one blind `SUM(amount)` per
   project.
2. **308_po_totals_nullable_for_mixed_currency.sql** — drops the `NOT
   NULL` constraint on `purchase_orders.subtotal`/`total_amount` (a PO
   mixing currencies now writes NULL there instead of a blended total;
   D10).
3. **309_project_budgets_per_currency.sql** — creates `project_budgets`
   (one row per project per currency, with an `is_primary` row kept in
   sync with the existing `projects.budget_amount`/`budget_currency`
   columns), backfills every existing project's budget into its primary
   row, and drops the now-unused `fx_to_budget()` function (D2).

Verified against a **fresh** copy of production (`fnc_erp_prodcopy`,
restored from a dump pulled the same day): all three migrations applied
cleanly in this order with no errors; every project's `budget_amount`
backfilled into exactly one matching `project_budgets` row (132/132, no
mismatches); zero unbalanced journal entries per currency across real
production data. The full test suite (every service, 700+ tests) then
ran directly against that same copy — safe only because of the test-
fixture fix below; re-running the same two integrity checks afterward
confirmed the three real companies' row counts were untouched.

## Rollback

Code only — these migrations are forward-only, same as every other
migration in this project; there is no down-migration.

1. Restore the pre-push production backup taken before this deploy
   (`scripts/backup-db.sh`'s output, or the deploy pipeline's own backup
   step) **only if the migrations themselves need undoing** — rolling
   back code alone does not require this, since nothing in this release
   drops a column or deletes data irreversibly.
2. Redeploy the previous commit (`scripts/rollback.sh [sha]` on the VPS,
   or push and let the normal deploy pipeline run) to revert the
   application code.
3. Confirm the old code still works against the *new* schema before
   rolling back code only, without restoring the backup — `project_budgets`,
   the nullable PO total columns, and the rewritten
   `v_project_profitability` view are all backward-compatible additions
   (nothing the old code read was removed or renamed), so a code-only
   rollback should be safe; verify on a copy first if in doubt, per the
   project's own "dev-only verification of a migration is not enough"
   rule.

## Minor, noticed while re-verifying, not fixed

A one-off synthetic company (`f9999999-...-0001`, "G1RCD Foreign Test Co")
created by an existing gateway test is left behind on `fnc_erp_prodcopy`
after the full suite runs — a pre-existing test-cleanup gap, unrelated to
anything in this release, and harmless (synthetic id, not one of the real
companies). Worth a follow-up `afterAll` fix in whichever test creates it,
not chased down here.

## Open items carried to the next release

- **bid_cost_items**: assessed, not fixed. A real per-currency fix
  cascades through 6 call sites, `computeBidPricing`, and the
  `BidCommercialSummary` GraphQL type's non-nullable `Float` fields — real
  design work, not a SQL-only change. A project bid needs one bidPrice in
  one currency by construction today and no real data has ever hit a
  multi-currency bid cost (checked).
- **FX Revaluation's actual bugs**: the screen is disabled (see above),
  but the underlying compute/reversal code (`services/finance/src/routes/revaluation.ts`)
  and its tables are untouched — kept on disk for a future release that
  drops them properly rather than leaving them half-migrated.
- **G1/G2** (old chart-code account lookups): the resolver code was fixed
  by an earlier, separate, already-merged release (`company_posting_accounts`,
  migration 303) — see the REQUIRED section above for the piece this
  release adds to actually make it work.
- **The rest of the Oct 15 Finance Pipelines audit**: see
  `docs/finance/gap-status.md` for the full, per-item, evidenced status.
  In short: G5 was already fixed earlier (outbox events reaching the
  dead-letter queue, migration 302, verified against production). G6,
  G7, G8, G12, G14, G20, G21 (the `cross_company` bypass), G26, G30 and
  G32 are confirmed still open, with the exact file/line for each. G10,
  G11, G16, G17, G23-G25, G27-G29, G31 and C1-C7 were not checked this
  session — gap-status.md marks each one "not verified" rather than
  claiming either way. None of these were started, per instruction.
