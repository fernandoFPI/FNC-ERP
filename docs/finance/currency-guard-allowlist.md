# Currency guard allowlist (Phase 2.5)

Read by `services/gateway/tests/currency-sum-guard.test.ts`. Each section
below is one known-open site the guard currently tolerates: a real
currency-blind `SUM`/`AVG` (or a case the guard can't tell apart from one
without reading the surrounding accounting logic) that existed before the
guard was added, isn't fixed yet, and isn't a false positive of the
text-matching itself (those get an inline `-- currency-safe: <reason>`
marker in the SQL instead — see the test file's own comment).

Every entry needs all three fields:
- `file`: path from the repo root, exactly as the guard reports it.
- `match`: a short, literal substring of the flagged query — present
  verbatim in the SQL text, no regex. One entry covers every occurrence in
  that file whose text contains this substring.
- `why`: why it's still open.

**Removing an entry is part of fixing that item** — once the query no
longer matches the guard's detector (grouped/filtered by `currency_code`,
moved onto a Phase 2.1 view, or genuinely fixed), delete its section here.
An entry that no longer matches anything is just dead weight, not a
problem (the guard doesn't require every entry to match something).

As of 2026-10-25 (currency fix plan items 1–9): every entry this file
used to carry for amount_company_currency (analytic.ts/costcenters.ts,
item 2), the dead duplicate ledger/consolidated REST routers (items 1 and
3+7), the gateway's undocumented fourth fx_rate-blended consolidated copy
(item 3+7), and journalEntry's single-entry totals (item 2) has been
removed — each query either no longer exists or no longer matches the
guard's detector. Only the two genuinely open items below remain.

---

## bid_cost_items
- file: services/gateway/src/graphql/resolvers.ts
- match: SUM(COALESCE(total_cost, quantity * unit_cost, 0))
- why: Assessed for this release (item 8 of the currency fix plan) and kept
  open: getBidDirectCostTotalGW's single scalar feeds 6 call sites
  (bidCommercialSummary query + updateBidCommercialSummary/
  submitBidForApproval/approveBid/rejectBid/reviseBid), which in turn feed
  computeBidPricing's overhead/margin/discount/contingency math and the
  BidCommercialSummary GraphQL type's non-nullable Float fields. Making
  this genuinely per-currency (same "NULL unless one currency" convention
  as journalEntry/recalcPOTotalsGW) means the schema fields, all 6
  resolvers, and BiddingTab.tsx's display would all need to handle a
  mixed-currency bid with no single bidPrice — real design work, not a
  SQL-only fix, and over the ~2 hour bar for this release. A project bid
  needs one bidPrice in one currency by construction today and real data
  has never hit a multi-currency bid cost (checked), so nothing is wrong
  in practice yet. Open for the next release. See
  `docs/finance/currency-blind-reads.md`'s bid_cost_items row.

## FX Revaluation existing local-currency balance
- file: services/finance/src/routes/revaluation.ts
- match: SUM(debit - credit), 0) AS balance_lc
- why: Sums `debit - credit` across every journal line for an account
  with no currency filter, to get the "existing local-currency balance"
  input to the revaluation calculation. The screen/routes/menu entry are
  now disabled (item 4 of the currency fix plan — nothing is converted
  anywhere, so there's nothing to revalue), but the route file and this
  SQL stay on disk unmounted for the later drop release, so the guard
  still sees it. This file's entire job was managing FX exposure, which
  may make blending here a deliberate, sanctioned exception to the
  no-conversion policy rather than a bug — needs someone with full context
  on this accounting model to confirm, not a guess made while building
  this guard. Remove this entry once revaluation.ts/its tables are
  actually dropped.

---

Also known-open, found while implementing item 9 (D2) but out of its
scope (project budgets only) and not tracked by this guard — flagged here
for visibility, not an allowlist entry since it doesn't match the guard's
detector (it's parameter-filtered, not a blind SUM):

- `services/finance/src/routes/budget.ts` (GL Budgets vs actual): its
  `actual_sub` CTE does a REAL `jl.debit - jl.credit) * COALESCE(fr.rate, 1)`
  conversion into the GL budget's own currency when a journal line's
  currency differs — the same no-currency-exchange policy conflict D2 just
  fixed for project budgets, already flagged by an earlier sweep as
  "D2-adjacent, not silently fixed" (see the comment immediately below
  that query). Still open; a real fix is the same shape as item 9
  (per-currency GL budget rows) but for a different module.
