# GL account selection by guessing (prefix / exact code / name) instead of explicit mapping

Phase 0, task 0.2 of the Finance fix plan. Pure research — no code changed.

Migrations 244 and 248 retired the old chart of accounts and loaded "FNC Chart v1.0" (307
accounts, 58 non-postable header accounts) into every company. Several journal-posting code
paths pick *which* `chart_of_accounts` row to post a line against by guessing — a hard-coded
`code LIKE 'prefix%'`, an exact `code = '...'` literal, or a `name ILIKE '...'` match — instead
of a caller-supplied or explicitly configured `account_id`. Under the new chart this guessing is
confirmed broken: a live production query showed prefixes `11, 12, 20, 21, 22, 25, 41, 50` always
resolve (alphabetically-first) to a HEADER account (not postable — violates the migration 237
`journal_lines` postable trigger), and prefix `26`, `60`, and exact code `2390` match **no**
account in any company.

**13 real sites found** in `services/*/src` (12 are genuine instances of the bug class across
`services/worker`, `services/gateway`, and one report query in `services/reporting`; one —
`postIntercoTransaction`'s name lookup — is name-based and therefore fragile, but fails loudly).
Everything in `services/finance/src/routes/*` that touches `chart_of_accounts` was checked and is
clean: it all resolves through an explicitly configured FK column (`gl_account_id`,
`asset_account_id`, `retention_account_id`, `advance_control_parent_account_id`, `account_id`,
etc.) or is a plain admin/report listing — not a posting-time guess. Those are not listed below.

**Silent fallback (most dangerous — no error, no log, nothing to grep for in a failure report):**
`createPOCompletionJournal` (outbox) and `postPOCompletionJournal` (gateway, shared by `completePO`
and `approveStockIssuance`) both silently `return` with zero journal posted when the
expense/liability lookup fails; `completeMO`'s same-company branch silently skips its entire
journal block the same way; `createPaymentJournal` and `createVendorPaymentJournal` silently drop
the WHT portion of the entry (books cash/AP only) when the WHT account lookup fails, rather than
failing or booking an unbalanced/incomplete amount loudly. `createInvoiceJournal` silently omits
just the retention debit line if no retention account is found, which can leave the journal entry
unbalanced with no error raised anywhere. Given prefix `26`/`60`/code `2390` now match nothing,
and prefixes like `11/12/20/21/41/50` resolve to a header, most of these silent paths are not
theoretical — they are the current production behavior.

**Hard failure (loud, at least detectable):** `createVendorInvoiceJournal`, `createMOJournal`,
`createRentalInvoiceJournal`, `createPayrollJournal`, both sides of
`interco-stock-transfer.ts`'s exact-code lookups, and `postIntercoTransaction`'s name lookups all
throw/raise a clear error when nothing matches — annoying (a run/mutation fails) but not a
hidden books error.

| file:line | matching logic | used for | fallback behavior if nothing matches |
|---|---|---|---|
| `services/worker/src/jobs/outbox-processor.ts:734-744` (`createInvoiceJournal`) | prefix: `code LIKE '12%'` (AR), `'22%'` (retention), `'41%'` (revenue) — first row per prefix via `.find()` | `PROJECT_INVOICE_JOURNAL_REQUESTED` event — project invoice AR/retention/revenue journal | Hard throw (`Missing required GL accounts...`) if AR or revenue missing. But if `retentionAmount > 0` and no retention account matches, the debit line for retention (line 786-792) is **silently skipped** — the journal entry is posted unbalanced (credit = gross, debit = net only), no error, no log. |
| `services/worker/src/jobs/outbox-processor.ts:842-852` (`createPOCompletionJournal`) | `account_type='expense' ORDER BY code ASC LIMIT 1`; `account_type='liability' ORDER BY code ASC LIMIT 1` | `PO_COMPLETION_JOURNAL_REQUESTED` event — async-outbox path for a project-linked PO's completion cost journal | **Fully silent.** Line 852: `if (!expAccountId || !apAccountId) return // no GL accounts configured, skip silently`. No log, no exception — the cost simply never reaches `project_cost_actuals`. Under the new chart, the first expense/liability account by code is a header, so this fires in production now. |
| `services/worker/src/jobs/outbox-processor.ts:909-919` (`createPaymentJournal`) | prefix: `'11%'`(cash)/`'12%'`(AR)/`'13%'`/`'23%'`/`'61%'`; exact codes `'1390'` (WHT recoverable), `'2390'` (WHT payable), `'6100'` (WHT expense) | `INVOICE_PAYMENT_JOURNAL_REQUESTED` event — client AR payment, with 2 WHT scenarios | Hard throw if cash/AR missing. If the scenario-specific WHT account (1390, or 2390+6100) isn't found, code falls to the final `else` (line 975-981): books a plain Dr Cash / Cr AR for `cashAmount` only — **the WHT amount is silently dropped from the books entirely**, no error, no log. Exact code `2390` is confirmed to match nothing under the new chart, so this fires whenever `wht_scenario==='fnc_pays'`. |
| `services/worker/src/jobs/outbox-processor.ts:996-1009` (`createVendorInvoiceJournal`) | prefix: `'20%'`/`'21%'` (AP), `'50%'`/`'51%'` (expense) | `VENDOR_INVOICE_JOURNAL_REQUESTED` event — vendor invoice AP/expense journal | Hard throw (`Missing AP/expense GL accounts...`) if either side missing. |
| `services/worker/src/jobs/outbox-processor.ts:1083-1096` (`createVendorPaymentJournal`) | prefix: `'11%'`(cash), `'20%'`/`'21%'`(AP), `'23%'` (fetched but unused directly); exact code `'2390'` (WHT payable) | `VENDOR_PAYMENT_JOURNAL_REQUESTED` event — vendor payment, with proportional WHT | Hard throw if cash/AP missing. If `2390` isn't found, falls to the simple branch (line 1109-1115): Dr AP / Cr Cash for `paymentAmount` only — **`proportionalWht` is silently never booked anywhere** (no WHT payable line at all), no error, no log. Code `2390` is confirmed absent in all companies under the new chart, so this fires on every WHT-applicable vendor payment. |
| `services/worker/src/jobs/outbox-processor.ts:1174-1188` (`createMOJournal`) | prefix: `'13%'` (inventory/finished goods), `'51%'` then fallback `'50%'` (production cost) | `MO_JOURNAL_REQUESTED` event — manufacturing order completion (outbox path) | Hard throw (`Missing inventory/cost GL accounts...`) if either missing. |
| `services/worker/src/jobs/outbox-processor.ts:1232-1248` (`createRentalInvoiceJournal`) | prefix: `'12%'` (AR), `'42%'` then fallback `'41%'` (revenue) — but the caller-supplied `p.revenue_account_id` takes priority over the guess when present | `RENTAL_INVOICE_JOURNAL_REQUESTED` event — rental invoice AR/revenue journal | Hard throw (`Missing AR/revenue GL accounts...`) only when no override was supplied AND the guess also fails. Partially mitigated by the explicit override already present in the payload. |
| `services/worker/src/jobs/outbox-processor.ts:1322-1340` (`createPayrollJournal`) | prefix: `'60%'` (salary expense), `'26%'` (salaries payable), `'25%'` (tax/SS payable) | `PAYROLL_JOURNAL_REQUESTED` event — payroll run GL journal | Hard throw (`Missing payroll GL accounts...`) if any missing. Prefix `26` is confirmed to match **no** account in any company under the new chart, so this now throws on every payroll run — payroll journals currently cannot post at all via this path. |
| `services/worker/src/jobs/interco-stock-transfer.ts:130-141` and `:146-158` (`executeIntercoStockTransfer`) | exact code: `code='1300'` (inventory, both sides), `code='2400'` (from-company Interco Payable), `code='1700'` (to-company Interco Receivable) | `INTERCO_STOCK_TRANSFER_EXECUTE` event — interco stock transfer GL postings on both companies' books | Hard throw naming the missing code(s) on each side (lines 138-141, 154-157) if not found. |
| `services/gateway/src/graphql/resolvers.ts:2264-2274` (`postPOCompletionJournal`, called from `completePO` at :36656 and `approveStockIssuance` at :35391) | `account_type='expense' ORDER BY code ASC LIMIT 1`; `account_type='liability' ORDER BY code ASC LIMIT 1` | `completePO` and `approveStockIssuance` mutations — synchronous mirror of the worker's `createPOCompletionJournal`, project PO completion cost journal | **Fully silent.** Line 2274: `if (!expAccountId || !apAccountId) return // no GL accounts configured, skip silently`. The mutation still succeeds (PO is marked complete) but no cost journal is ever created and nothing is logged. Same header-account exposure as the worker twin above. |
| `services/gateway/src/graphql/resolvers.ts:27004-27014` (`completeMO` mutation, same-company project branch) | `account_type='expense' ORDER BY code ASC LIMIT 1` (cost account); `account_type='asset' AND name ILIKE '%inventory%' ORDER BY code ASC LIMIT 1` (inventory account) | `completeMO` mutation — same-company manufacturing-order-for-project cost journal | **Fully silent**, and the silence isn't even commented: `if (costAccountId && invAccountId) { ...post journal... }` has no `else` at all (lines 27014-27045). If either lookup fails, the whole journal-posting block is skipped — the MO still completes normally with no cost ever hitting the project. |
| `services/gateway/src/graphql/resolvers.ts:37151-37157` and `:37159-37165` (`postIntercoTransaction` mutation) | name: `name ILIKE 'Intercompany Receivable'` (from-company), `name ILIKE 'Intercompany Payable'` (to-company) — exact string, no wildcards | `postIntercoTransaction` mutation — posts an approved interco transaction to each company's GL | Hard throw (`From-company has no Intercompany Receivable account configured` / `To-company has no Intercompany Payable account configured`) if not found — not silent, but still depends on an exact account *name* existing verbatim in every company's chart rather than a configured id (fragile to a rename/translation). |
| `services/reporting/src/routes/entity.ts:187-195` (cash-flow report, opening/closing cash balance) | prefix: `coa.code LIKE '11%'`, aggregated (`SUM`) across all matching rows | Cash-flow statement report — read-side, not a posting path | No explicit "nothing matched" fallback since it's a `SUM`/aggregate, not a single-row pick: header accounts (no `journal_lines`) don't skew it, but any real cash-type account that doesn't use the `11%` prefix under the new chart is silently excluded from the cash balance, and any non-cash account that happens to start with `11` would be silently included — wrong number, no error. |

## Checked and ruled out (not this bug class)

- All of `services/finance/src/routes/*` (`accounts.ts`, `journals.ts`, `budget.ts`, `costcenters.ts`,
  `analytic.ts`, `reports.ts`, `bank.ts`, `assets.ts`, `vendor-invoices.ts`, `petty-cash.ts`,
  `retention.ts`, `revaluation.ts`, `employee-advances.ts`, `advance-config.ts`,
  `expense-claims.ts`) — every `chart_of_accounts` reference there is either a plain admin
  CRUD/listing endpoint (`SELECT * FROM chart_of_accounts WHERE company_id=$1 [...]`,
  `is_postable`/`category` filters for a human to pick from) or joins through an explicit,
  already-configured FK (`gl_account_id`, `account_id`, `asset_account_id`, `accum_dep_account_id`,
  `dep_expense_account_id`, `retention_account_id`, `offset_account_id`,
  `advance_control_parent_account_id`, `advance_control_account_id`). This is exactly the
  "explicitly configured mapping" pattern the broken sites above should be using instead.
- `services/reporting/src/routes/compliance.ts` and `consolidated.ts` — join `chart_of_accounts`
  only to group/filter by `account_type` (`asset`/`liability`/`revenue`/`expense`), a real
  classification column, not a code/name guess.
- `services/gateway/src/graphql/resolvers.ts` lines 6455, 6474, 6528, 7379, 7681-7682, 9997,
  10017-10019, 10109, 10312, 10357, 10384, 10509, 12046, 12129, 12490, 28992-29247, 29877-29878,
  36410-36411, 37302, 37317 — all admin listing endpoints, trial balance / journal report joins,
  attachment/account-id validation (`WHERE id=$1 AND company_id=$2`), or display-only name/code
  lookups by id. None of these choose which account to post a journal line against.
- Test fixture files (`services/*/tests/*.ts`) that `DELETE FROM chart_of_accounts WHERE
  code='9093'` etc. — these are test cleanup of fixture rows, not application posting logic, and
  live under `services/*/tests`, not `services/*/src`, so out of scope per the task.
