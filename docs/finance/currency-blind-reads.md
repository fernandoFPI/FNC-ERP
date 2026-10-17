# Currency-blind reads audit (Phase 0, task 0.1)

Research only — no code changed. This file is the complete inventory of SQL
aggregates (`SUM`/`AVG`) and JS/TS `.reduce()`/manual-accumulation totals that
combine rows from a `currency_code`-bearing table **without** grouping or
filtering by `currency_code`, so an account/project/vendor/employee with rows
in more than one currency gets them silently blended into one meaningless
number. Policy: every currency is its own complete set of books; nothing may
ever be summed or converted across different `currency_code` values.

**Total findings below: 69 rows.** Of these, **60 are real or plausible
currency-blind bugs** (including 6 that are a different, related nature —
a deliberate `fx_rate`/`fx_rate_to_base` *conversion* that conflicts with the
"no currency exchange anywhere" policy, rather than a blind unguarded `SUM`;
see the **Other** section), **5 are "good pattern" rows kept for contrast**
(they already group by `currency_code` correctly — proof the team knows how
to do this right, which makes the ungrouped ones elsewhere negligence rather
than a missing feature), **3 are confirmed false positives** (the table in
question has no `currency_code` column at all, verified against its
migration), and **1 is a minor/cosmetic case** (a cross-currency sum used
only as an internal sort key, never displayed). False positives and
good-pattern rows are kept in the table so a future reader doesn't have to
re-derive the same result.

**The 5 most severe:**
1. **Executive Dashboard** (`services/gateway/src/graphql/resolvers.ts:28972‑29079`,
   the home-page dashboard) — eight separate blind cross-currency sums
   (revenue, costs, open PO value, active-project budgets, two 6‑month
   trends, entity breakdown, project-profitability scatter) feeding the
   single screen every user sees first.
2. **Consolidated Trial Balance / P&L / Balance Sheet**
   (`services/reporting/src/routes/consolidated.ts`) — multiplies
   `debit`/`credit` by `jl.fx_rate` and sums into one blended "`_iqd`" figure
   with **no** `GROUP BY currency_code`; live behind the Consolidated
   Trial Balance sidebar link.
3. **`project_cost_actuals` blind sums are far more widespread than the three
   already-confirmed sites** — at least 9 more locations across
   `projects.ts`, `resolvers.ts`, `reporting/projects.ts`, and the
   `v_project_profitability` database view itself (so every consumer of that
   view inherits the bug for free).
4. **Three independent WHT ("Withholding Tax Payable") implementations, all
   three currency-blind**: `finance/ar.ts` (`wht-recoverable`),
   `reporting/compliance.ts` (`wht-payable`), and the gateway `whtReport`
   resolver. A compliance/tax number is wrong in three different places by
   three different hands.
5. **AR and AP dashboards** (`finance/ar.ts` summary/by-client,
   `finance/vendor-invoices.ts` ap-summary) — the outstanding-balance and
   aging-bucket totals on the two primary collections/payables screens blend
   currencies, both confirmed live via `ARDashboard.tsx` / `APDashboard.tsx`.

A separate, important nuance found along the way and **not** the same bug
shape as the rest: several PO-total recalculation paths
(`recalcPO`, `applyPOEditChanges`, `setPOLineActualPrice` in
`resolvers.ts`) explicitly multiply by `fx_rate_to_base` to *convert* lines
into the PO's base currency before summing — real currency exchange, done on
purpose, with code comments justifying it. This directly contradicts this
repo's own `CLAUDE.md` Hard Rule ("`fx_rate_to_base` is dead" / "no
cross-currency conversion"). That rule is stale, or this code is the
violation — Phase 1 needs to decide which before touching it. See the
**Other** section below for the exact sites.

---

## Ledger reports (Trial Balance / P&L / Balance Sheet / Account Ledger / Cash Flow / Consolidated)

| file:line | table | what it totals | screen or route that shows it |
|---|---|---|---|
| `services/gateway/src/graphql/resolvers.ts:6517-6536` (`trialBalance`) | `journal_lines` | `SUM(jl.debit)`, `SUM(jl.credit)`, `SUM(jl.debit-jl.credit)` per account, no `GROUP BY currency_code` | **Live.** Finance → Reports → Trial Balance (`TrialBalance.tsx`, GraphQL) |
| `services/gateway/src/graphql/resolvers.ts:10026-10084` (`accountLedger`) | `journal_lines` | running balance + `totalDebit`/`totalCredit`/`netBalance` for one account, no currency split | **Live.** Account Ledger drill-down from Chart of Accounts |
| `services/gateway/src/graphql/resolvers.ts:10293-10336` (`profitLoss`) | `journal_lines` | `SUM(jl.credit-jl.debit)` per account + `totalRevenue`/`totalExpenses`/`netProfit` via JS `.reduce()` | **Live.** Finance → Reports → Profit & Loss (`ProfitLoss.tsx`) |
| `services/gateway/src/graphql/resolvers.ts:10338-10392` (`balanceSheet`) | `journal_lines` | Uses `jl.amount_company_currency` ("IQD base") deliberately, per its own comment — **not** a blind sum, but a real currency conversion that conflicts with the "no currency exchange anywhere" policy | **Live.** Finance → Reports → Balance Sheet (`BalanceSheet.tsx`) — flag for policy reconciliation, not a classic blind read |
| `services/finance/src/routes/reports.ts:21-179` (`/finance/reports/trial-balance`, `/profit-loss`, `/balance-sheet`, `/account-balance`) | `journal_lines` | Same blind `SUM(jl.debit)`/`SUM(jl.credit)` pattern, 4 endpoints | **Dead code.** No frontend caller found — the equivalent live pages all use the GraphQL resolvers above instead. Confirm dead before deleting (playbook #12) |
| `services/reporting/src/routes/entity.ts:11-38` (`/reporting/trial-balance`) | `journal_lines` | Same blind pattern | No frontend caller found — likely dead, mounted and reachable at `/reporting` |
| `services/reporting/src/routes/entity.ts:41-78` (`/reporting/profit-loss`) | `journal_lines` | Same blind pattern | No frontend caller found — likely dead |
| `services/reporting/src/routes/entity.ts:81-106` (`/reporting/balance-sheet`) | `journal_lines` | Same blind pattern | No frontend caller found — likely dead |
| `services/reporting/src/routes/entity.ts:121-197` (`/reporting/cash-flow`, 5 sub-queries: net income, asset/liability/equity changes, opening/closing cash) | `journal_lines` | Every sub-query is `SUM(jl.debit-jl.credit)`/`SUM(jl.credit-jl.debit)` with no currency split | **Live.** Reporting → Financial → Cash Flow Statement (`CashFlowStatement.tsx`, confirmed caller of `/reporting/cash-flow`) |
| `services/reporting/src/routes/consolidated.ts:26-47` + `packages/db/migrations/019_reporting_views.sql:1-17` (`v_consolidated_trial_balance`) | `journal_lines` | `SUM(jl.debit*jl.fx_rate)`, `SUM(jl.credit*jl.fx_rate)` → one blended "`_iqd`" figure, **no** `GROUP BY currency_code` | **Live.** Sidebar "Consolidated → Trial Balance" (`/reporting/consolidated/trial-balance`) |
| `services/reporting/src/routes/consolidated.ts:76-94` (`/reporting/consolidated/profit-loss`) | `journal_lines` | Same `fx_rate`-multiplied blind sum, labelled `net_iqd` | **Live**, same router, `requirePermission('reporting.consolidated.view')` |
| `services/reporting/src/routes/consolidated.ts:118-137` + `v_interco_eliminations` | `journal_lines` | Same `fx_rate`-multiplied blind sum, labelled `balance_iqd` | **Live.** Consolidated → Balance Sheet |
| `services/gateway/src/graphql/resolvers.ts:28988-29008` (`executiveDashboard`, "revenue this month" / "costs this month") | `journal_lines` | `SUM(jl.credit-jl.debit)` / `SUM(jl.debit-jl.credit)`, company-wide, no currency split | **Live.** Home-page Executive Dashboard |
| `services/gateway/src/graphql/resolvers.ts:29019-29030` (`executiveDashboard`, 6-month revenue+cost trend) | `journal_lines` | Same pattern, per month | **Live.** Executive Dashboard trend chart |
| `services/gateway/src/graphql/resolvers.ts:29033-29057` (`executiveDashboard`, entity breakdown + entity 6-month trend) | `journal_lines` | Same pattern, per company | **Live.** Executive Dashboard "by entity" widgets |

## AR / AP

| file:line | table | what it totals | screen or route that shows it |
|---|---|---|---|
| `services/finance/src/routes/ar.ts:13-81` (`/finance/ar/summary`) | `project_invoices` + `rental_invoices` (UNION) | `total_outstanding`, `total_invoiced`, `total_collected`, 4 aging buckets | **Live.** AR Dashboard KPI row (`ARDashboard.tsx`) |
| `services/finance/src/routes/ar.ts:85-113` (`/finance/ar/wht-recoverable`) | `project_invoices` + `rental_invoices` | YTD `wht_recoverable` | **Live.** AR Dashboard (`ARDashboard.tsx`) — WHT recoverable widget |
| `services/finance/src/routes/ar.ts:198-246` (`/finance/ar/by-client`) | `project_invoices` + `rental_invoices` | `total_outstanding`, `overdue_amount` per client | **Live.** AR Dashboard "by client" table |
| `services/finance/src/routes/vendor-invoices.ts:148-189` (`/finance/vendor-invoices/ap-summary`) | `vendor_invoices` + `vendor_payments` | `total_outstanding`, 4 aging buckets, `paid_this_month` | **Live.** AP Dashboard (`APDashboard.tsx`) and `useAPPendingCount.ts` |
| `services/finance/src/routes/vendor-invoices.ts:192-220` (`/finance/vendor-invoices/vendor/:vendorId/summary`) | `vendor_invoices` | `total_outstanding` per vendor | Plausible, lower confidence — `v.currency_code` is shown but invoices aren't filtered to it; real only if one vendor's invoices can span >1 currency |
| `services/gateway/src/graphql/resolvers.ts:29674-29715` (`whtReport`) | `vendor_invoices` | `SUM(vi.total_amount)`, `SUM(vi.wht_amount)` grouped by vendor+period (not currency) + `totalWHT`/`totalPayments` JS `.reduce()` | **Live.** Reporting → Compliance → WHT Report (`WHTReport.tsx`) |
| `services/reporting/src/routes/compliance.ts:47-115` (`/reporting/compliance/wht-payable`) | `vendor_invoices` | `total_wht_payable`, monthly breakdown, top-10 vendors | **Live.** Finance → WHT Payable page (`WHTPayablePage.tsx`) |
| `apps/web/src/pages/finance/ar/ARDashboard.tsx:217-218` | `project_invoices` + `rental_invoices` (via `/finance/ar/invoices`) | Frontend `.reduce()`: `projectTotal`/`rentalTotal` for the Project vs Rental donut chart | **Live**, compounds the already-ungrouped `/finance/ar/invoices` API response |
| `apps/web/src/pages/rental/invoices/RentalInvoicesPage.tsx:129-134` | `rental_invoices` | Frontend `.reduce()`: `totalOutstanding`/`totalPaid` KPI cards | **Live** |
| `services/gateway/src/graphql/resolvers.ts:29725-29749` (`fxExposureReport`) | `journal_lines` | **Good pattern** — correctly `GROUP BY jl.currency_code` and filters `currency_code != 'IQD'` | Not a bug; kept for contrast |
| `services/reporting/src/routes/compliance.ts:118-152` (`/reporting/compliance/fx-exposure`) | `journal_lines` | **Good pattern** — `GROUP BY jl.currency_code`. The one extra column, `net_exposure_iqd` (line ~135), multiplies by `fx_rates` to convert — a deliberate conversion, same policy-conflict nuance as the Balance Sheet row above, not a blind sum | Not counted as a blind-sum bug; flagged for the same policy reconciliation |

## Projects

| file:line | table | what it totals | screen or route that shows it |
|---|---|---|---|
| `services/projects/src/routes/projects.ts:264` (`GET /projects` list) | `project_cost_actuals` | `total_costs` per project row | **Live.** Projects list page |
| `services/projects/src/routes/projects.ts:352-354` (`GET /projects/:id`) | `project_cost_actuals` | `cost_summary.total` | **Live.** Project detail header |
| `services/projects/src/routes/projects.ts:1321-1327` (`GET /projects/:id/budget`) | `project_cost_actuals` + `project_budget_lines` | `actual_amount`/`variance` per budget category | **Live.** Project → Budget tab |
| `services/gateway/src/graphql/resolvers.ts:8271` (projects list resolver) | `project_cost_actuals` | `total_costs` per project row | **Live** — gateway's GraphQL duplicate of the REST list above |
| `services/gateway/src/graphql/resolvers.ts:29061-29073` (`executiveDashboard`, profitability scatter) | `project_cost_actuals` | `actual_cost`, `margin_pct` per project | **Live.** Executive Dashboard profitability scatter chart |
| `services/gateway/src/graphql/resolvers.ts:29296-29299` (`projectProfitabilityReport`) | `project_cost_actuals` | `actual_cost`, `margin_pct` per project | **Live.** Projects → Reports → Profitability |
| `packages/db/migrations/019_reporting_views.sql:20-40` (`v_project_profitability` VIEW) | `project_cost_actuals` | `total_costs`, `total_revenue`, `gross_margin`, `budget_remaining` — baked into the view itself | **Live**, consumed by `resolvers.ts:9658`, `projects.ts:1387`, and both queries below — one fix point, many callers |
| `services/reporting/src/routes/projects.ts:18-34` (`/reporting/projects/profitability`) | `v_project_profitability` (→ `project_cost_actuals`) | Same view, listed/sorted | **Live.** Reporting → Projects → Profitability |
| `services/reporting/src/routes/projects.ts:51-57` (`/reporting/projects/:id/detail`, budget-vs-actual) | `project_cost_actuals` + `project_budget_lines` | `actual_costs` per category | **Live.** Reporting → Project detail |
| `services/reporting/src/routes/projects.ts:59-65` (same route, cost timeline) | `project_cost_actuals` | Monthly `costs` by `source_type` | **Live.** Reporting → Project detail, cost timeline chart |
| `services/finance/src/routes/budget.ts:293-328` (`/budget/:id/vs-actual`) | `gl_budget_lines` + `journal_lines` | `actual_amount` via `CASE WHEN jl.currency_code = target THEN raw ELSE raw * COALESCE(fr.rate,1) END` — an explicit currency *conversion* (policy conflict) that silently falls back to a 1:1 rate (blind-add) whenever no `fx_rates` row exists | **Live.** Finance → Budget → Budget vs Actual (`BudgetDetail.tsx`) — the "Budget vs Actual" report named explicitly in this audit's brief |
| `services/gateway/src/graphql/resolvers.ts:31291` (`projectCostCodes`) | `project_committed_costs` | `SUM(committed_amount)` per `cost_code_id` (table defaults to `currency_code='USD'`) | **Live.** Project → Cost Control → Cost Codes |
| `services/gateway/src/graphql/resolvers.ts:31469` (`projectCostSummary`) | `project_committed_costs` | `SUM(cc.committed_amount)` per category | **Live.** Project → Cost Control → Summary |
| `services/gateway/src/graphql/resolvers.ts:8892-8893, 8966-8967` (`projectContracts`, `projectContract`) | `project_invoices` (`gross_total`) + `project_invoice_payments` (`amount`) | `total_invoiced`, `total_paid` per contract | Plausible, lower confidence — a contract has one `currency_code`; real only if invoices under one contract can diverge from it |
| `services/gateway/src/graphql/resolvers.ts:26203` (invoice line recalc) | `project_invoice_lines` | `SUM(subtotal)`, `SUM(line_total)`, `SUM(margin_amount)` for one invoice's lines | Plausible, lower confidence — invoice-scoped; real only if lines on one invoice can carry a different `currency_code` than the invoice header |
| `apps/web/src/pages/projects/detail/ProjectDetail.tsx:1717-1736` | `purchase_orders` (via `recentPos`) | Frontend `.reduce()`: `hdrApprAmt`/`hdrPendAmt` header stat cards (approved/pending PO value) | **Live.** Project detail header |
| `apps/web/src/pages/projects/detail/ProjectDetail.tsx:32688-32697` | `project_cost_codes` + `project_committed_costs` + `project_cost_actuals` | Frontend `.reduce()`: footer totals for budget/committed/actual/remaining columns — compounds the two `project_committed_costs`/`project_cost_actuals` backend bugs above | **Live.** Project → Cost Control → Cost Codes footer row |
| `apps/web/src/pages/projects/detail/ProjectDetail.tsx:33846-33851` | `project_variation_orders` | Frontend `.reduce()`: `totalApproved`/`totalPending`/`totalRejected`/`totalDraft`/`grandTotal` | **Live.** Project → Variation Orders → Analysis tab |

## Payroll

| file:line | table | what it totals | screen or route that shows it |
|---|---|---|---|
| `packages/db/migrations/019_reporting_views.sql:63-79` (`v_payroll_cost_by_company` VIEW) | `payslips` | `SUM(gross_salary)`, `SUM(net_salary)`, `SUM(income_tax)`, `SUM(social_security)` | **Dead.** No query anywhere in `services/` or `apps/web/src` references this view |
| `services/reporting/src/routes/hr.ts:29-42` (`/reporting/payroll/summary`) | `payslips` | `total_gross`, `total_net`, `total_income_tax`, `total_social_security` per payroll run | No frontend caller found — likely dead, but mounted/reachable |
| `services/gateway/src/graphql/resolvers.ts:29779-29815` (`payrollTaxReport`) | `payslips` | Rows don't even carry `currency_code` through to the client; frontend then sums gross/tax/SS blind | **Live.** Reporting → Compliance → Payroll Tax Report |
| `apps/web/src/pages/reporting/compliance/PayrollTaxReport.tsx:55-57` | `payslips` (via `payrollTaxReport`) | Frontend `.reduce()`: `totalIncomeTax`/`totalSS`/`totalGross` footer totals | **Live**, compounds the resolver above |
| `services/hr/src/routes/payroll.ts:205-217` (payroll run generation) | `salary_deduction_requests` | `otherDeductions = SUM(amount)` of one employee's pending deductions, subtracted straight from `grossSalary` with no check that the deduction's `currency_code` matches the payslip's | **Live, write-time** — this runs when a payroll run is actually generated, not just a report; highest severity in this section since a mismatched currency corrupts `net_salary` on the posted payslip itself |

## Advances & petty cash

| file:line | table | what it totals | screen or route that shows it |
|---|---|---|---|
| `services/finance/src/routes/employee-advances.ts:176-196` (`/employee-advances/summary`) | `employee_advances` | `pending_amount`, `total_outstanding`, company-wide | **Live.** Employee Advances dashboard KPI row |
| `services/finance/src/routes/employee-advances.ts:847-879` (`/employee-advances/dashboard`, `byEmployee`) | `employee_advances` | `total_issued`/`total_settled`/`total_returned`/`total_outstanding` per employee — `GROUP BY employee_id` only, **not** `currency_code` | **Live.** Employee Advances company-wide dashboard — note: the sibling `expense-claims.ts` `/dashboard` (below) explicitly groups by `currency_code` with a code comment explaining why; this file was never given the same fix |
| `apps/web/src/pages/finance/advances/EmployeeAdvanceDashboard.tsx:69` | `employee_advances` | Frontend `.reduce()`: `totalOutstanding` | **Live**, compounds the two rows above |
| `services/finance/src/routes/expense-claims.ts:236-257` (`/expense-claims/summary`) | `expense_claims` | `pending_amount`/`posted_amount`/`paid_amount` via `SUM(total_amount) FILTER`, company-wide, **not** grouped by currency | **Live.** Expense Claims dashboard KPI row — contrast: lines 309-338 of the *same file* correctly group the equivalent `/dashboard` query by `currency_code`; this `/summary` endpoint was missed |
| `services/finance/src/routes/expense-claims.ts:309-338` (`/expense-claims/dashboard`) | `expense_claims` | **Good pattern** — `GROUP BY employee_id, employee_name, currency_code`, with a code comment explicitly warning against blending currencies | Not a bug; kept for contrast — proof the team already knows this bug class and fixed it here but nowhere else in the same file |
| `apps/web/src/pages/finance/expenses/ExpenseClaimDashboard.tsx:116-117` | `expense_claims` (per-currency breakdown from the `/dashboard` route above) | Frontend `.reduce()` over `Object.values(amounts)` — used **only** as a sort comparator key, the displayed amounts themselves stay correctly split per currency | Minor/cosmetic — sort order can be swayed by blending currencies, but no wrong number is ever shown on screen |

## Billing

| file:line | table | what it totals | screen or route that shows it |
|---|---|---|---|
| `services/gateway/src/graphql/resolvers.ts:18261, 18346, 18410, 18467, 18529, 31072` (6 duplicate sites — bid submit/approve/reject/revise flow) | `bid_cost_items` | `SUM(COALESCE(total_cost, quantity*unit_cost, 0))` per project bid | **Live.** Project → Bidding → Commercial Summary — same "money total recomputed in several places" pattern as the PO recalc cluster (playbook #6); if one is fixed, grep for all 6 |
| `services/gateway/src/graphql/resolvers.ts:29634-29652` (`spendByCategory`) | `purchase_orders` | `SUM(po.total_amount)` grouped by analytic account category only | **Live.** Dashboard widget "Spend by Category" |
| `services/gateway/src/graphql/resolvers.ts:29654-29672` (`revenueVsTarget`) | `project_invoices` | `SUM(net_payable)` grouped by month only | **Live.** Dashboard widget "Revenue vs Target" |
| `services/gateway/src/graphql/resolvers.ts:8639` and `:29920` (`intercoStockTransfers` list, 2 sites) | `interco_stock_transfer_lines` | `SUM(istl.total_transfer_value)` per transfer | Plausible, lower confidence — `currency_code` defaults `'IQD'` per line and these values are internal costing, likely but not provably single-currency per transfer |
| `apps/web/src/pages/interco/stock-transfers/IntercoStockTransferDetail.tsx:107` | `interco_stock_transfer_lines` | Frontend `.reduce()`: `totalValue` over one transfer's lines | **Live**, same caveat as the row above |
| `services/finance/src/routes/assets.ts:144-164` (`/finance/assets/summary`) | `fixed_assets` | `SUM(purchase_cost)`, `SUM(book_value)`, `SUM(accumulated_depreciation)` | **False positive** — `fixed_assets` (migration 099) has no `currency_code` column at all; not the same `equipment_assets` (rental) table |
| `services/finance/src/routes/retention.ts:27-80` (`/retention/summary`, `/retention/aging`) | `retention_records` | `SUM(retention_amount - released_amount)`, several buckets | **False positive** — `retention_records` (migration 101) has no `currency_code` column |
| `services/reporting/src/routes/compliance.ts:192-218` (`/reporting/compliance/inventory-valuation`) | `stock_balances` / `products` | Frontend-style `.reduce()` in the route handler: `total_inventory_value` | **False positive** — inventory carries no `currency_code` at all (last-cost valuation is single-currency by design per `docs/claude/domain.md`); flagged for completeness only |
| `services/finance/src/routes/payment-vouchers.ts:159-160, 279-280` | Payment voucher lines | `.reduce()` into `total_iqd` and `total_usd` **separately** | **Good pattern** — already keeps the two currencies apart instead of blending them; not a bug |

## Other

These don't fit the "blind `SUM`/`reduce` with no grouping" shape of the rest
of this audit, but surfaced while checking the same code paths and conflict
directly with the "no currency exchange anywhere" policy this phase is meant
to enforce. Recommend Phase 1 decide on these explicitly rather than silently
folding them into the blind-sum fix.

| file:line | nature of the issue |
|---|---|
| `services/gateway/src/graphql/resolvers.ts:4304-4320` (`recalcPO`) | Deliberately multiplies `total_price * COALESCE(fx_rate_to_base,1)` to convert every line into the PO's `base_currency_code` before summing into `purchase_orders.subtotal`/`total_amount`. Code comment: "the header total is always a real, correctly-converted number even when lines were quoted in different currencies." This is real currency exchange, done on purpose, and it contradicts this repo's own `CLAUDE.md` Hard Rule ("`fx_rate_to_base` is dead" / "no cross-currency conversion"). |
| `services/gateway/src/graphql/resolvers.ts:714-721` (`applyPOEditChanges`) | Same `fx_rate_to_base`-converted recalculation, duplicated — comment explicitly says "Converted the same way as `recalcPO`." |
| `services/gateway/src/graphql/resolvers.ts:25405-25412` (`setPOLineActualPrice`) | Same `fx_rate_to_base`-converted recalculation, duplicated a third time. |
| `services/gateway/src/graphql/resolvers.ts:34766-34774` (Finish Buying → fork child POs by vendor) | **Inconsistent** with the three sites above: this one is a plain `SUM(total_price)` with **no** `fx_rate_to_base` conversion at all. A same-vendor purchase split across genuinely different currencies will blend them here. A nearby code comment (lines 34656-34661) already calls this exact scenario "a known, accepted gap," so it's documented, not hidden — but it's the odd one out among four total-recalculation paths that otherwise agree with each other. |
| `services/gateway/src/graphql/resolvers.ts:1883, 33762-33763` | **Good pattern**, for contrast: `SELECT currency_code, COALESCE(SUM(total_price),0) ... GROUP BY currency_code` — proves the per-currency-subtotal approach is already used elsewhere in this exact file for PO/requisition lines. |

---

### Notes on method

- Authoritative `currency_code` table list was rebuilt from
  `packages/db/migrations/*.sql` directly (parsing every `CREATE TABLE` body
  and `ALTER TABLE ... ADD COLUMN currency_code`), not taken on faith from the
  brief. Six tables named in the brief's seed list turned out to be false
  positives with **no** `currency_code` column: `journal_entries` (it's on
  the child `journal_lines`), `stock_lots`, `vendor_invoice_lines`,
  `project_material_issue_lines`, `expense_categories`, and
  `fx_revaluation_runs` (its header has no `currency_code`; only the child
  `fx_revaluation_lines` does — `fx_revaluation_runs.total_gain_loss` is
  intentionally base-currency-denominated by the nature of FX revaluation, so
  it is not a bug of this class).
- `project_labor_entries`, `project_equipment_log`, `project_cost_codes`,
  `project_client_billings`, `fixed_assets`, and `retention_records` were
  also checked directly against their migrations and confirmed to have no
  `currency_code` column — several `SUM()`s over them looked suspicious at
  first glance but are false positives, listed above where relevant for
  completeness.
- "Live" vs "dead" was determined by grepping `apps/web/src` (and
  `apps/mobile/src` where relevant) for the exact route path or GraphQL
  query/resolver name, not assumed. Several REST duplicates of now-GraphQL
  screens (`services/finance/src/routes/reports.ts`, three of the four
  endpoints in `services/reporting/src/routes/entity.ts`) have no caller and
  are flagged as likely dead rather than omitted, per playbook #12 (confirm
  dead vs live before any fix touches them).
