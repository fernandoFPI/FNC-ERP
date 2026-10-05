# Debugging playbook: bug classes that have actually occurred here

Rule: when a NEW bug class is found, add an entry here (name, real example, how to spot it, how to fix).
Don't re-derive, check these first.

1. **Phantom column/table (most common).** SQL references a column/table that no migration created.
   Check names against `packages/db/migrations` before writing or trusting any SQL. Hot spots:
   `services/gateway/src/routes/mobile-sync.ts`, `services/gateway/src/graphql/resolvers.ts`, finance
   report routes. Many paths have zero tests or mock the DB, so nothing caught it. Examples:
   `createVendor` inserted non-existent `withholding_tax_type`; `journal_lines` has no
   `company_id`/`created_at` (they live on `journal_entries`); `users` has no company_id/role (use
   `user_company_roles`); `locations` is `stock_locations`; `avg_cost` is `average_cost`;
   `outbox_dead_letter_queue` is `outbox_dead_letters`; `purchase_orders.vendor_name` never existed (join `vendors`).
   Audit technique: dump `information_schema.columns` from a migrate-only DB, regex-extract
   `alias.column` from SQL template literals, cross-check.
2. **A fix can mask a second bug.** Removing the phantom column exposed `withholding_tax_rate` sent as
   NULL into a NOT NULL DEFAULT 0 column. After unblocking a crash, re-check adjacent constraints.
3. **LEFT JOIN + filter leak.** Put company/date filters in a subquery, not a second JOIN condition, or
   non-matching rows leak into SUM() (Budget vs Actual).
4. **Duplicate resolver keys.** `resolvers.ts` merges base `Query`/`Mutation` with
   `phase5QueryResolvers`/`phase5MutationResolvers` via `Object.assign`; phase5 ALWAYS wins. Check BOTH
   copies before deciding which is buggy. Past hits: missing `system_admin` checks (retry/dismiss DLQ,
   resetStuckEvents), invalid CHECK value `status='retrying'`, cross-tenant leak (`intercoStockTransfer`
   detail had no company filter). Diff top-level keys by script; the file is 20k+ lines.
5. **Duplicate GraphQL schema fields** (`rejectPO`/`cancelPO` declared twice): graphql-tools silently
   merges args instead of erroring. Look for repeated field names in `schema.ts`.
6. **Money totals recomputed in several places.** PO totals had 3 separate recalc paths (`recalcPO`,
   `applyPOEditChanges`, `setPOLineActualPrice`), only one in the original plan. Changing money logic =
   grep for every path that writes the total.
7. **Migrations that compensate balances.** When a migration disables the trigger and fixes balances,
   use an upsert mirroring `update_stock_balance()`'s `ON CONFLICT`, never a bare `UPDATE` (no-ops when
   no row exists). Dev artifacts from earlier iterations can hide this; verify on a clean DB.
8. **DB errors masked as auth failures.** `packages/auth` middleware once turned DB errors into 401;
   real failures should be 500. A mysterious 401 may be a DB problem.
9. **Stale shared package.** Fix in `packages/*/src` "did nothing": `dist/` wasn't rebuilt. Check before
   re-diagnosing logic.
10. **Dev DB ≠ prod schema.** A bug invisible on `fnc_erp_dev` (drifted) but real on a migrate-built DB.
11. **dev/test DB split.** "column does not exist" in gateway tests right after migrate → migration not
    applied to `fnc_erp_test`.
12. **Dead code vs live code.** Before fixing/removing, grep callers across `apps/web`, `apps/mobile`,
    `scripts`. procurement/interco/manufacturing REST services were dead and removed. hr, inventory,
    notifications, rental, reporting REST are MIXED-LIVE (mobile punch, worker stock-move, unread-count
    poll, maintenance, cash-flow/WHT reports): do not delete wholesale. finance and projects are live.
13. **"Dead" status that isn't.** Query real data before removing a status/field (a live PO sat at the
    "dead" status; removal was correctly abandoned).
14. **Tests that mock the DB prove nothing about SQL.** Run the real query against a migrated DB.
15. **Test script hangs.** `"test": "vitest"` = watch mode; use `vitest run`. A hang can be hidden
    because an earlier package fails first and aborts the pipeline.
16. **CI-only env failures.** Turbo strict env mode stripped env vars; invisible locally because the
    shell already had them and direct vitest bypasses turbo.
17. **Flaky tests under parallel run.** Shared fixtures/DB races. Re-run the service alone; if it
    passes, it's the harness, not the code. Add `fileParallelism:false` for 2+ test files.
18. **Save/DB failure triage.** Check column data types and DECIMAL precision/overflow before assuming a
    missing column. Browser/cPanel JS errors: consider document.ready scope and caching first.
19. **Permissions not taking effect.** Needs gateway + auth restart and re-login; identity/permission
    state is dormant until re-login.
