# `journal_lines.fx_rate` / `journal_lines.amount_company_currency` — reader inventory

Phase 0, task 0.3 of the Finance fix plan. Pure research, no code changed. Schema: `packages/db/migrations/006_finance_schema.sql:85-86` —
`fx_rate NUMERIC(20,6) NOT NULL DEFAULT 1`, `amount_company_currency NUMERIC(20,4) NOT NULL`.

**Summary:** 15 distinct true/live reader sites, 3 dead-or-cosmetic reader sites (code selects/exposes
the column but nothing acts on the value), and 1 test file that asserts on the columns directly. The
live readers are concentrated in exactly the places the task flagback predicted — the gateway
`balanceSheet` resolver, the cost-center/analytic-account detail routes + their frontend pages, three
journal-reversal/combine code paths that copy an existing line's fx_rate/amount_company_currency
forward unchanged, and the `services/reporting/consolidated.ts` REST report trio (which itself looks
largely superseded by GraphQL — see caveat below). This is **not** yet a short list: the cost-center and
analytic-account detail screens display the converted amount and the per-line rate directly to users, so
retiring these columns requires rewriting at least 4 backend routes and 3 frontend pages, not just
deleting dead code. The reversal/combine code paths (4 of them) need a real decision — recompute at
reversal time from `debit`/`credit`/`currency_code`, which changes behavior for anything posted before
the FX-conversion policy existed. Feasibility: **not yet feasible to drop the columns**, but the
required rewrite is well-scoped and mostly mechanical once the reversal-copy question is settled.

Methodology: grepped the whole tree for `fx_rate` and `amount_company_currency`, then manually filtered
out hits that belong to unrelated tables/columns (`purchase_orders.fx_rate`, `po_fx_rate`,
`interco_transactions.fx_rate`, `employee_advances.fx_rate`, `advance_settlement_lines.fx_rate`,
`fx_rates` table, `fx_revaluation_lines.fx_rate_used`, store-in `fx_rate_to_base`) — none of those are
`journal_lines` columns and are out of scope. Every remaining hit was read in context to classify
true-reader vs. writer vs. dead/cosmetic, and to check GraphQL resolver duplicate-key shadowing
(playbook item #4) and REST-vs-GraphQL caller liveness (playbook item #29 pattern) before trusting it.

## Readers

### True / live readers

1. **`services/gateway/src/graphql/resolvers.ts:10338-10398`** — `Query.balanceSheet` resolver. Uses
   `jl.amount_company_currency` at lines 10351, 10352, 10377, 10379 to compute every asset/liability/
   equity account balance and retained earnings for the Balance Sheet. Comment at 10343 explicitly says
   "Use amount_company_currency (IQD base) for FX-consistent totals." Not shadowed by any phase5
   duplicate key (checked). Consumed by `apps/web/src/pages/finance/reports/BalanceSheet.tsx` via the
   `balanceSheet` GraphQL query. **This is the single most behavior-critical reader in the codebase.**

2. **`services/gateway/src/graphql/resolvers.ts:12366-12443`** — `Mutation.combineJournalEntries`.
   `SELECT * FROM journal_lines WHERE journal_entry_id = ANY($1)` (12394-12397), then reads
   `line.fx_rate` / `line.amount_company_currency` off each row (12422-12423 typing, 12439-12440 as
   INSERT params) and carries them forward **unchanged** into the new combined journal's lines, instead
   of recomputing. True reader — the value directly becomes the new row's value.

3. **`services/finance/src/routes/journals.ts:497-569`** — `POST /:id/cancel`. When the entry being
   cancelled is `posted`, does `SELECT * FROM journal_lines WHERE journal_entry_id = $1` (525-528), then
   reads `line.fx_rate` / `line.amount_company_currency` (565-566) and inserts them unchanged into the
   reversal entry (debit/credit swapped). True reader. **Caveat:** no caller for this REST route was
   found anywhere in `apps/web` or `apps/mobile` — the frontend's Journal pages (`JournalForm.tsx`,
   `JournalDetail.tsx`, `JournalsPage.tsx`) all go through the GraphQL gateway's own
   `createJournalEntry`/`postJournalEntry`/`cancelJournalEntry`/`combineJournalEntries` resolvers
   instead, which hit Postgres directly. This REST route is only exercised by
   `services/finance/tests/finance.test.ts` (`POST /finance/journals`, `supertest` against the finance
   app). It may be dead in production — flag for whoever owns task-list cleanup, but still counted here
   since it does execute if reached.

4. **`services/finance/src/routes/employee-advances.ts:643-712`** — `POST /:id/void` ("Void advance ...
   reverses issuance journal"). `SELECT * FROM journal_lines WHERE journal_entry_id=$1` (677-680), then
   reads `line['fx_rate']` / `line['amount_company_currency']` (709-710) and carries them forward into
   the reversal entry, same pattern as #3. This route **is** live: called from
   `apps/web/src/pages/finance/advances/EmployeeAdvanceDetail.tsx:235`
   (`api.post(\`/finance/advances/${id}/${action}\`, ...)`, action includes `void`).

5. **`services/finance/src/routes/revaluation.ts:320-339`** — reversal ("flip") of a posted FX
   revaluation run. `INSERT INTO journal_lines (...) SELECT $1, account_id, currency_code, credit,
   debit, 'Reversal: ' || description, amount_company_currency FROM journal_lines WHERE
   journal_entry_id=$2 AND account_id=$3` (334-336) — reads `amount_company_currency` inline via the
   `INSERT ... SELECT` and carries it forward unchanged (only debit/credit are swapped). True reader.
   (Note: the revaluation run's own *creation* of new gain/loss lines, lines 201-203/216-218, does not
   read `fx_rate` — it's a writer only, see Writers section.)

6. **`services/finance/src/routes/costcenters.ts:61-110`** — `GET /:id` (Cost Center detail).
   `COALESCE(SUM(CASE WHEN jl.debit > 0 THEN jl.amount_company_currency ELSE 0 END),0) AS total_debits`
   / same for `total_credits` (73-74) — true reader, this *is* the total shown on the page. Separately,
   the per-line query at 90-104 selects `jl.fx_rate, jl.amount_company_currency` (92-93) and returns them
   as `lines` in the JSON payload — also a true reader (see #9, the frontend consumer).

7. **`services/finance/src/routes/analytic.ts:18-58` and `60-110`** — `GET /` (list) and `GET /:id`
   (detail) for Analytic Accounts. Same pattern as costcenters.ts: `SUM(... jl.amount_company_currency
   ...)` for `total_debits`/`total_credits` in both the list query (42-43) and detail query (75-76), and
   the detail route's per-line query selects `jl.fx_rate, jl.amount_company_currency` (92-93) returned as
   `lines`. True reader — see #10/#11 for the frontend consumers.

8. **`apps/web/src/pages/finance/cost-centers/CostCenterDetail.tsx`** — type decl at lines 20-21
   (`fx_rate: string`, `amount_company_currency: string`); rendered at 354-356 (`parseFloat(line.fx_rate)`
   shown as "@ {rate}" whenever the line's currency isn't IQD) and 365
   (`amount={parseFloat(line.amount_company_currency)}` passed to `<AmountDisplay currency="IQD">`).
   Also `totalDebits`/`totalCredits` at 115-116 come straight from the route's `amount_company_currency`
   aggregate (see #6). True reader — directly displayed to the user.

9. **`apps/web/src/pages/finance/analytic-accounts/AnalyticAccountDetail.tsx`** — identical pattern to
   #8: type decl 19-21, rendered at 352-354 and 363, totals at 101-102. True reader.

10. **`apps/web/src/pages/finance/analytic-accounts/AnalyticAccountsPage.tsx`** — list page. Type decl
    at 29-30 (`total_debits`, `total_credits`); used for an imbalance calculation at line 156
    (`parseFloat(aa.total_debits) - parseFloat(aa.total_credits)`) and rendered in two table columns at
    204-216 via `<AmountDisplay amount={parseFloat(aa.total_debits)} currency="IQD">` (and credits).
    These numbers originate from `analytic.ts`'s list-route `SUM(jl.amount_company_currency)` (#7). True
    reader (indirect, via the aggregate, but it's a direct pass-through of the column's values).

11. **`services/reporting/src/routes/consolidated.ts`** — three REST report endpoints, all multiplying
    raw debit/credit by `jl.fx_rate` to produce an "IQD" figure:
    - `/trial-balance` (lines 29-39, and via `v_consolidated_trial_balance` — see below — when no
      `as_of_date` is given)
    - `/profit-loss` (lines 76-90, `(jl.credit-jl.debit)*jl.fx_rate` / `(jl.debit-jl.credit)*jl.fx_rate`)
    - `/balance-sheet` (lines 118-130, `(jl.debit-jl.credit)*jl.fx_rate`)

    **Caveat, important:** no caller for any of these three REST routes was found in `apps/web` or
    `apps/mobile`. The frontend's Consolidated P&L / BS / Trial Balance pages
    (`apps/web/src/pages/reporting/consolidated/Consolidated{PL,BS,TrialBalance}.tsx`) all call the
    **GraphQL** `consolidatedPL` / `consolidatedBS` / `consolidatedTrialBalance` queries instead (Apollo
    `useQuery`) — and those GraphQL resolvers live in `phase5QueryResolvers`
    (`resolvers.ts:29161-29260`), which compute everything from raw `jl.debit - jl.credit` and **do not
    touch `fx_rate` or `amount_company_currency` at all**. So this REST trio in
    `services/reporting/src/routes/consolidated.ts` looks like orphaned/superseded REST code (same
    shape as playbook item #29's "removed service, caller left behind" — except here it's the reverse:
    the route was never removed after its caller moved to GraphQL). It's only exercised directly by
    `services/reporting/tests/reporting.test.ts` / `reporting.perf.ts`. Listed here because the code
    does execute and the column's value does change the output if the route is ever hit directly (it's
    a real Express route, mounted and reachable by URL even with no UI link) — but it's a strong
    candidate for deletion alongside the column retirement, which would shrink this list further.
    Underlying view used by the no-date-filter branch of `/trial-balance`:
    `packages/db/migrations/019_reporting_views.sql:1-17` (`v_consolidated_trial_balance`, which itself
    does `SUM(jl.debit * jl.fx_rate)` etc. at lines 9-11). No other caller of that view was found.

### Dead / cosmetic readers (selected or exposed, but the value doesn't change behavior)

12. **`services/gateway/src/graphql/resolvers.ts:9982-10005`** — base `Query.consolidatedTrialBalance`
    resolver. Reads `jl.fx_rate` at 9992-9994 to build `total_debit_iqd`/`total_credit_iqd`/
    `balance_iqd`. **This resolver is unreachable dead code**: `resolvers.Query` is defined at line
    6448, and `Object.assign(resolvers.Query, phase5QueryResolvers)` at line 38217 overwrites the
    `consolidatedTrialBalance` key with `phase5QueryResolvers.consolidatedTrialBalance` (line 29238),
    which computes everything from raw `jl.debit`/`jl.credit` and never references `fx_rate`. Per
    playbook item #4 (duplicate resolver keys, phase5 always wins), the function object at 9982 is
    simply discarded and never invoked by GraphQL execution. Zero priority for the retirement gate, but
    worth deleting as part of the cleanup since it's dead code that name-checks a retiring column.

13. **`services/gateway/src/graphql/schema.ts:1958-1970` (`type JournalLine { ... fx_rate: String }`)
    + `apps/web/src/graphql/finance.ts:112-143` (`JOURNAL_ENTRY_QUERY`, selects `fx_rate` on each line at
    line 142) + `apps/web/src/pages/finance/journals/JournalDetail.tsx`** — the GraphQL `JournalLine`
    type exposes `fx_rate` (but **not** `amount_company_currency` — that field isn't in the schema at
    all, so even though the backing resolver does `SELECT jl.*` at `resolvers.ts:10108`, GraphQL
    execution silently drops `amount_company_currency` since no schema field requests it). The frontend
    query does ask for `fx_rate`, so it round-trips to the browser — but `JournalDetail.tsx` never reads
    `line.fx_rate` anywhere in its render (confirmed by grep; it only reads `account_code`,
    `account_name`, `description`, `currency_code`, `debit`, `credit`). Dead/cosmetic: selected over the
    wire, displayed nowhere.

14. **`services/finance/src/routes/journals.ts:267-275`** — after `POST /` creates a journal entry, it
    re-queries `SELECT * FROM journal_lines WHERE journal_entry_id = $1` (269-271) and echoes
    `fullLines.rows` (each containing `fx_rate`/`amount_company_currency`) back in the JSON response.
    This is a read-after-write of values the same request just computed and inserted, not a read of
    pre-existing data — and (same caveat as reader #3) this REST route appears to have no production
    caller. Low priority either way.

### Test-only (will need updating when columns are dropped, not a production reader)

15. **`services/gateway/tests/interco-billing-bridge.test.ts:563-592`** — directly does
    `SELECT jl.fx_rate, jl.amount_company_currency, jl.debit, jl.credit FROM journal_lines jl ...`
    (566-567, 581-582) twice (once for the "from" company's lines, once for the "to" company's), and
    asserts on both columns (`expect(parseFloat(line.fx_rate)).toBe(1)` /
    `.toBeCloseTo(usdToIqd, 5)`, and the matching `amount_company_currency` assertions) at lines 576-577,
    589-590. This test will need rewriting (or deleting, if the interco-billing FX-conversion behavior
    itself goes away under the new "no currency conversion" policy) before the columns can be dropped.

## Writers (not blocking, for inventory)

Every `INSERT INTO journal_lines (...)` that sets `fx_rate` and/or `amount_company_currency`, found
along the way. These keep writing until a later phase; not part of the task-0.3 gate.

- **`services/worker/src/jobs/outbox-processor.ts`** — the outbox event→journal-entry job, multiple
  `source_type` branches: lines 781, 788, 795 (billing: AR/retention/revenue), 872, 887 (project
  expense/AP), 938, 945, 961, 978 (vendor-payment WHT scenarios: cash/AR), 1051-1052 (AP, cost-center
  tagged), 1205 (manufacturing-order completion: inventory/cost, no `fx_rate` column passed — defaults to
  1), 1268, 1273 (rental AR/revenue), 1360 (payroll tax/SS payable).
- **`services/worker/src/jobs/interco-stock-transfer.ts:393, 420`** — interco stock transfer DR/CR
  (payable/receivable vs. inventory), `fx_rate` hard-coded to `1` in both.
- **`services/worker/src/jobs/asset-depreciation.ts:75, 84`** — monthly scheduled depreciation job,
  creates `draft` depreciation journal lines (no `fx_rate` column; `amount_company_currency` = raw
  amount).
- **`services/finance/src/routes/assets.ts:527, 536`** — user-triggered `POST .../run-depreciation` REST
  endpoint (same depreciation event as above, see playbook item #23 for its drift history with the
  worker job).
- **`services/finance/src/routes/petty-cash.ts:283, 399`** — petty cash replenishment / top-up postings.
- **`services/finance/src/routes/retention.ts:228, 232, 238, 242, 334, 338, 344, 348`** — retention
  hold (AR/AP) and retention release postings.
- **`services/finance/src/routes/bank.ts:713, 717, 723, 727`** — bank transaction money-in/money-out
  postings.
- **`services/finance/src/routes/expense-claims.ts:1030, 1043, 1089, 1102, 1221, 1235`** — expense claim
  funding/settlement journal postings (reimburse/advance/petty_cash paths).
- **`services/finance/src/routes/employee-advances.ts`** — advance issuance: 564, 577. Void reversal
  (carries forward existing values — also a reader, see #4): 698. PO-line settlement: 1184 (uses the
  *advance's own* `fx_rate`, not a `journal_lines` read). Settlement-line postings: 1778. Settlement
  rounding/offset line: ~1797. Another settlement/return flow: 2130, 2142.
- **`services/finance/src/routes/revaluation.ts:201-203, 216-218`** — new FX-revaluation gain/loss
  journal lines for a posted run (`amount_company_currency` set equal to the raw debit/credit amount,
  i.e. not actually multiplied by a rate here — only the reversal path, #5 above, copies an existing
  value forward).
- **`services/gateway/src/graphql/resolvers.ts:12136-12208`** — `Mutation.createJournalEntry`, writes
  `fx_rate`/`amount_company_currency` from the caller-supplied `JournalLineInput.fx_rate` (defaults to 1)
  at line 12183-12192.
- **`services/gateway/src/graphql/resolvers.ts:12366-12443`** — `Mutation.combineJournalEntries` (also a
  reader, see #2) — the INSERT side at 12425-12442.
- **`services/finance/src/routes/journals.ts:234-251`** — `POST /` create-journal-entry REST route,
  writes `fx_rate`/`amount_company_currency` computed from the request body (see reader caveat #3/#14
  for this route's apparent lack of a production caller).
- **`services/finance/src/routes/journals.ts:553-568`** — `POST /:id/cancel` reversal INSERT (also a
  reader, see #3) — the INSERT side.
- **`services/gateway/seed_e2e_scenario.cjs:785-790`** — E2E seed/fixture script, not production code;
  hard-codes `fx_rate = 1`.
