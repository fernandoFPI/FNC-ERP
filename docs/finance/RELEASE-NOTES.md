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
  blank for that PO instead of a blended number (D10). Every screen shows one
  total per currency for it instead (list, detail, price-verification panel,
  requisition child POs, vendor page, dashboard queue, preview). The GraphQL
  field `PurchaseOrder.total_amount` is nullable for this reason; as first
  released it was still non-null, which made such a PO fail to load — fixed in
  the follow-up hotfix, regression test `po-mixed-currency-graphql.test.ts`.
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

**Three user actions fail on the spot instead, not through the Outbox:**
completing a project purchase order (`completePO`), approving the stock
issuance of a project PO that is fully covered from stock
(`approveStockIssuance`), and completing a manufacturing order that is linked
to a project (`completeMO`). Each posts its cost journal inside the same
transaction as the status change. With the map empty the click fails with
`POSTING_ACCOUNT_NOT_CONFIGURED: <role>`, the whole action rolls back, and the
PO stays in its previous status (`invoiced`, `payment_pending` or
`ready_to_issue`).

- `completePO` and `approveStockIssuance` need exactly two roles, set for the
  **project's** company (not the user's): `expense_default` (an active,
  postable expense account: the debit side, tagged to the project so it lands
  in project cost) and `ap` (an active, postable payables account: the credit
  side). A company-wide default (currency left blank) covers every currency;
  a per-currency row is only needed to post USD to a different account. They
  only run for a project PO that has an analytic account and is not
  advance-funded; any other PO skips the lookup. The journals are created as
  drafts, so Finance still posts them.
- `completeMO` needs `expense_default` and `inventory`.
- The system checks that the account belongs to the company, is active and is
  postable. It does not check the account type, so choosing an expense account
  for `expense_default` and a payables account for `ap` is Finance's call.

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

**There is no code-only rollback past migration 309.** Do not run
`scripts/rollback.sh` to a commit from before this release (`b543243`) on its
own, and do not treat the previous code as compatible with the new schema.

Why: migrations are forward-only (no down-migration), and
`scripts/rollback.sh` reverts application code only. It deliberately runs no
`pnpm migrate`. The previous code does not run against the new schema:

- **309** drops `fx_to_budget()`. The previous release's `project` query calls
  it (commit `64c0ed4`, `resolvers.ts`), so every project detail page would
  fail on the old code.
- **308** lets `purchase_orders.subtotal` / `total_amount` be NULL (a PO with
  lines in more than one currency, or with no lines). The old code declares
  `PurchaseOrder.total_amount` non-null, so those POs fail to load, and one
  mixed-currency child PO nulls a requisition's whole Child POs list.
- **305** reshapes `v_project_profitability` to one row per project and
  currency; the old consumers assume one row per project.

What to do instead:

1. **Fix forward (preferred).** Hotfix on `dev`, then push to `production`:
   the deploy pipeline runs its test gate and deploys.
2. **Only if fixing forward is impossible:** restore a database dump taken
   *before* the migrations ran, then redeploy the old commit. This discards
   every write made since that dump. `.github/workflows/deploy.yml` has **no
   backup step**; a dump exists only if `scripts/backup-db.sh` was run
   (manually or from cron). Check the newest dump's timestamp is earlier than
   the deploy before relying on it, and take a fresh dump of the current
   state first so nothing is lost for good.

An earlier revision of this section called a code-only rollback safe and
referred to "the deploy pipeline's own backup step". Both were wrong.

## Minor, noticed while re-verifying, not fixed

A one-off synthetic company (`f9999999-...-0001`, "G1RCD Foreign Test Co")
created by an existing gateway test is left behind on `fnc_erp_prodcopy`
after the full suite runs — a pre-existing test-cleanup gap, unrelated to
anything in this release, and harmless (synthetic id, not one of the real
companies). Worth a follow-up `afterAll` fix in whichever test creates it,
not chased down here.

## Open items carried to the next release

- **TOP PRIORITY — cross-company `completePO` / `poTransition`.** Found while
  auditing this release; it is not a currency bug and predates it. Confirmed by
  reading the code, **not yet reproduced with a test** (the first step of the fix
  is a failing two-company test). `completePO` loads the PO with
  `WHERE id=$1` and no `company_id` (`resolvers.ts`, `completePO`), and its
  permission check (`hasFinanceApprovalGW(auth.userId, auth.companyId, …)`)
  only looks at the *caller's* company. `approveStockIssuance` loads the PO the
  same way. `poTransition` — shared by 27 call sites — reads and updates the PO
  with `WHERE id=$1 FOR UPDATE` and never checks the company either. So a
  finance approver in company A who has a company B PO id can complete it, and
  `postPOCompletionJournal` then posts a draft journal into company B's books.
  The id is a UUID, which makes it hard to guess but is not an authorization
  check, and it breaks the project's multi-tenancy hard rule. Fix: add the
  caller's `company_id` to the lookups in `completePO`, `approveStockIssuance`
  and `poTransition` (pass the company in), audit the other 26 `poTransition`
  callers for the same gap, and cover it with a two-company test.
- **Next — mixed-currency POs are under-counted in project totals.** Since
  migration 308 a mixed-currency PO has `total_amount` NULL, and three readers
  still sum it by the PO's *header* currency, so such a PO drops out:
  the project page's `recent_pos` JSON (`resolvers.ts` `project` query,
  `'total_amount', po.total_amount`) feeding the approved/pending PO sums in
  `ProjectDetail.tsx` (`hdrApprAmt` / `hdrPendAmt`); the committed-cost join
  `po_c` in the same query (`SUM(total_amount) … GROUP BY currency_code`),
  which makes `committedCosts` low and `budgetRemaining` too high; and the
  executive dashboard's pending-PO KPI (`SUM(total_amount) … AND
  currency_code=$2`). Fix: read `getPOCurrencyTotals` / `po_lines` grouped by
  the *line* currency instead of `purchase_orders.total_amount`.
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
