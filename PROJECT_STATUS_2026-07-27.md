# Test & Deploy Pipeline Remediation — Status as of 2026-07-27

## Why this document exists

This session went from "restore the test gate" to a much deeper cleanup than
planned: the test gate had never actually run successfully in CI, which meant
years of accumulated bugs — in the tests themselves, in the deploy pipeline,
and in real application code — had never once been caught. This doc is a
handoff for whoever (human or Claude) picks this up next. It explains the
starting situation, what got fixed and why, what's confirmed live, and what's
deliberately left undone.

If you're starting a new session on this repo, read this before assuming
anything about test/deploy health — a lot changed today.

## Starting situation

- `deploy.yml` (triggers on push to `production`) had no test step at all.
- `ci.yml` (triggers on PR/push to `main`/`develop`) had a `pnpm test` step,
  but its `lint` step was broken (bad `parserOptions.project` path), so the
  pipeline never got far enough to actually run tests.
- Net effect: **no CI test run had ever succeeded end-to-end on this repo**.
  Whatever bugs existed in tests, in the pipeline config, or in application
  code paths only exercised by tests, had zero chance of being caught.

## What we fixed

### 1. Test suite debt (finance, hr, inventory, auth, apps/web, worker)

- FK-ordering bugs in test cleanup (`services/{finance,hr,inventory}/tests/setup.ts`):
  tests deleted parent rows (`journal_entries`, `purchase_orders`, `payroll_runs`,
  `products`) before clearing dependent rows that reference them without
  `ON DELETE CASCADE`. Fixed by adding the missing cleanup steps in FK order.
- `services/auth/tests/setup.ts` had a session-cleanup query matching
  `email LIKE '%fnc-erp.local'` — i.e. **every** service's test user, not just
  auth's own. Under parallel test runs this silently killed other services'
  live sessions mid-test. Scoped to auth's own test user.
- `packages/auth/src/middleware.ts`'s `requireAuth()` caught DB errors during
  session lookup and returned a misleading 401 instead of a 500 — masking
  real infrastructure failures as auth failures. Now returns 500 on genuine
  DB errors.
- 9 services (`hr` + 8 more) had `vitest.config.ts`'s `singleFork: true`
  without `fileParallelism: false` — test **files** within one service still
  interleaved and raced on shared fixtures even though they ran in one OS
  process. Added `fileParallelism: false` everywhere it was missing.
- `apps/web`: `Sidebar.tsx` read `window.location.pathname` instead of the
  router's own `location` (from `useLocation()`) to decide which nav group to
  auto-expand — worked under `BrowserRouter` by accident, broken under
  `MemoryRouter` (i.e. in tests, and potentially real client-side navigation
  edge cases). Fixed to use the router's location. `formatNumber()` didn't
  force `minimumFractionDigits: 2`, so whole numbers rendered as `"100"`
  instead of `"100.00"`.
- `services/worker/tests/fx-sync.test.ts`'s `@fnc-erp/db` mock was missing
  `getSystemConfig`/`startJobRun`/`finishJobRun`/`partialJobRun`/`failJobRun`
  — added after `fx-sync.ts` started using them.

### 2. Deploy pipeline reliability (`.github/workflows/{ci,deploy}.yml`, `turbo.json`)

Each of these was found by actually watching a deploy run and fail — every
one was a new discovery, not something visible from reading the config:

- `turbo.json` had no `envMode` set, so Turbo 2.x's default `"strict"` mode
  silently stripped `DATABASE_URL`/`JWT_SECRET`/etc. from every task's
  environment in CI. Invisible until now because `pnpm build` (tsc) never
  touches runtime env parsing, and `pnpm test` had never actually executed in
  this pipeline before. Fixed with `"envMode": "loose"`.
- Migrations create schema but don't seed reference data (companies, chart of
  accounts, etc.) that every test's hardcoded `TEST_COMPANY_ID` assumes
  exists. CI's fresh ephemeral Postgres had no seed data at all. Added a
  `pnpm seed:test` step between migrate and test.
- Neither workflow defined a `redis` service container (only `postgres`) —
  the real health-check logic (from earlier work) genuinely checks Redis, so
  `/health` correctly reported 503 with nothing listening on that port.
  Added a `redis:7-alpine` service to both workflows.
- `apps/web/package.json`'s `"test": "vitest"` had no `run` flag, defaulting
  to watch mode. Invisible until every other package finally passed, because
  some other failure always aborted the pipeline before reaching it. Once
  everything else was green, `pnpm test` hung indefinitely on this one.
  Fixed to `"vitest run"`.
- `*.perf.ts` files in 6 services assert `P95 < 10ms` on a trivial health
  check. These pass reliably on a fast local machine but fail intermittently
  on GitHub Actions' shared, variably-loaded runners — there is no threshold
  simultaneously tight enough to catch a real regression and loose enough to
  survive CI noise. Excluded `*.perf.ts` from the default `test` task in all
  6 affected services (`vitest.config.ts`'s `include` is now conditional on a
  `PERF_TESTS` env var); added a `test:perf` script per service for
  on-demand/manual performance checking.
- Every service's tests share one hardcoded `TEST_COMPANY_ID` against one
  Postgres DB. Under real parallel CI load this raced hard enough that two
  deploys failed back-to-back on two *different* services, both of which
  passed cleanly standalone. `--concurrency=4 || retry once` was not
  reliable enough. Moved to `pnpm test --concurrency=1` (fully sequential) —
  slower (~50s locally for the full suite from a cold cache) but removes the
  race structurally instead of just reducing its odds. This is a deploy
  gate, not an interactive dev loop, so the extra time is an acceptable
  trade.

**Result:** the first fully-green deploy since this work started landed and
was confirmed live on the VPS.

### 3. Schema audit — 11 confirmed-broken queries across the codebase

Triggered by finding that `createVendor` referenced `vendors.withholding_tax_type`,
a column that has never existed in any migration (only `withholding_tax_rate`
was ever added, migration 040). That led to a systematic sweep: dump
`information_schema.columns` from a **freshly migrated** database (not the
long-lived local dev DB — see "known drift" below), regex-extract every
`alias.column` reference out of SQL template literals across `services/*/src`
and `packages/*/src`, and cross-check against the real schema. Every finding
was verified by directly executing the corrected query against a
properly-migrated DB before shipping — not just "looks right."

Fixed (commits `278765d`, `3f79e6c`):

- **`createVendor`** (gateway resolver) — removed the phantom
  `withholding_tax_type` column reference from the schema, resolver INSERT,
  and frontend query fragment (confirmed dead via `VendorForm.tsx`, the only
  real vendor UI, never reading or writing it). Also fixed a second bug the
  first one was masking: `withholding_tax_rate` is `NOT NULL DEFAULT 0`, but
  the resolver inserted an explicit `NULL` when the field was omitted.
- **`momNotify`** — referenced `users.company_id`/`users.role`, which don't
  exist (they live on `user_company_roles`); also checked for `role='admin'`,
  which has never been a real role value in this system.
- **`stockLot`** — `stock_lots.current_location_id` doesn't exist; derived
  "current location" from the most recent `stock_moves` row instead.
- **`inventoryValuationReport`** — joined a nonexistent `locations` table
  (real name `stock_locations`), selected `avg_cost` (real: `average_cost`),
  and referenced `stock_balances.company_id` (doesn't exist — derived via the
  location join).
- **DLQ retry/dismiss** — `outbox_dead_letter_queue` doesn't exist (real:
  `outbox_dead_letters`, migration 026).
- **Interco pricing settings** — `interco_pricing_configs` never got a
  migration at all (only the audit-log table `interco_pricing_config_log`
  existed). Added migration `176_interco_pricing_configs.sql`. Also found
  the update mutation accepted a `notes` field but never wrote to the log
  table, so "history" was always empty even once the table existed — wired
  that up too.
- **`projectTeamMembers`** — `project_team_members` doesn't exist (real:
  `project_members`, which also has no `company_id` — scoped via the
  `employees` join instead).
- **`services/gateway/src/routes/mobile-sync.ts`** (worst-affected file) —
  employee profile sync referenced nonexistent `employees.contract_type`/
  `is_active` and `salary_configs.base_amount`/`pay_type`; work-location sync
  needed columns (`code`, `location_type`) that were never added to
  `work_locations` despite the mobile WatermelonDB client requiring them
  (given safe literal defaults, since there's no evidence of intended
  values); the entire overtime-approval workflow referenced a nonexistent
  `overtime_requests` table (real: `overtime_logs`, which also had none of
  the `status`/`reviewed_by`/`reviewed_at`/`review_notes` workflow columns
  the approve/reject handlers already read and wrote) — added migration
  `177_hr_approval_workflow_columns.sql`, mirroring `leave_requests`' shape
  exactly since that table already has the same pattern. `leave_requests`
  itself was also missing `review_notes` despite it being written on every
  leave approval.
- **`services/finance/src/routes/budget.ts`** (Budget vs Actual) and
  **`revaluation.ts`** (FX Revaluation) — both joined
  `journal_lines.company_id`/`created_at`, neither of which exists;
  `company_id` and the date live on `journal_entries`. `budget.ts`'s join
  was a `LEFT JOIN`, so the filter had to move into a subquery rather than a
  second join condition, or non-matching rows would leak into the SUM.
- **`services/finance/src/routes/journals.ts`** — two linked-PO endpoints
  selected `purchase_orders.vendor_name`, which has never existed. Added a
  join to `vendors`.

### 4. Duplicate resolver keys — 6 real authorization bugs

Triggered by a live crash in `retryDLQEntry` (invalid status value violating
the DLQ table's CHECK constraint). Tracing it revealed `resolvers.ts` defines
some resolvers **twice** — once correctly in the base `Mutation`/`Query`
object literal, again in `phase5MutationResolvers`/`phase5QueryResolvers`,
merged in with `Object.assign(resolvers.Mutation, phase5MutationResolvers)`
near the end of the file. **The phase5 version always wins**, since
`Object.assign` runs after the base object is fully built — regardless of
which copy is actually correct.

A systematic scan (compare top-level keys between the base object's line
range and the phase5 object's line range) found **12 duplicate keys total**
(6 Mutation, 6 Query). 6 were real, currently-live bugs (commit `faed027`):

- `retryOutboxEvent`, `retryDLQEntry`, `dismissDLQEntry`, `resetStuckEvents`
  — the active (phase5) versions had **no `system_admin` role check at all**;
  any authenticated user could call all four. `retryDLQEntry`'s active
  version also wrote an invalid status and never actually re-queued the
  failed event (the base version does both correctly). Fixed by deleting the
  phase5 duplicates — the base versions had no missing functionality worth
  preserving.
- `intercoStockTransfer` (detail query) — active version had **no company
  scoping** (`WHERE ist.id=$1` only) — any authenticated user could view
  another company's inter-company transfer by ID. Patched in place (kept the
  richer active response shape, added the missing `WHERE` clause) rather
  than reverting to the base version, since the frontend was built against
  the active version's field names.
- `outboxEventConfigs` — active version dropped the `system_admin` check.
  Patched in place, same reasoning.

The other 6 duplicates (`rejectPO`, `cancelPO`, `consolidatedTrialBalance`,
`intercoTransactions`, `intercoStockTransfers` list, `companyIntercoPricingSettings`)
were checked individually and left alone — their active versions are equal
or strictly better than the shadowed base versions (proper role checks via
`isAdmin`/`isDeptHead`/`isApprover` helpers, added pagination, parameterized
queries where the base had raw string interpolation). Harmless dead code,
not a bug.

### 5. Two more from the same phantom-column family (commit `db25853`)

Found live, from the DLQ admin panel, immediately after the deploy above —
confirmation the schema audit in step 3 was not exhaustive, exactly as
predicted below.

- **`notifications.push_sent`** has never existed in any migration, but
  every notification insert in `services/worker` (~10 call sites across
  `outbox-processor.ts` and `contract-expiry-alerts.ts` — PO approvals,
  project status changes, MO/rental/HR/finance events, DLQ alerts) has
  included it since those files were written. **Every notification the
  worker has tried to create has been failing.** Added migration
  `178_notifications_push_sent.sql` (`BOOLEAN NOT NULL DEFAULT false`;
  nothing reads it yet — write-only scaffolding for a future push-dispatch
  job). While in there: `alertSystemAdminsOfDLQEntry`'s in-app notification
  insert was *also* missing `company_id` (a `NOT NULL` column) — silently
  swallowed by a best-effort `.catch()`, which is presumably why it went
  unnoticed. Fixed by selecting `ucr.company_id` alongside the admin query.
- **`outboxMonitor` and `resetStuckEvents`** both filtered
  `service_outbox.updated_at`, which doesn't exist (only `created_at` does).
  The correct column for "how long has this been stuck processing" is
  `first_attempted_at`, set via `COALESCE(first_attempted_at, NOW())`
  exactly when an event first transitions to `'processing'`. Notably, this
  bug survived the duplicate-resolver fix in step 4 (commit `faed027`)
  because `resetStuckEvents`' *authorization* was what was broken there —
  the query itself had this separate, unrelated bug the whole time, in both
  the shadowed-and-buggy version **and** the "correct" base version I
  restored. A reminder that "this resolver has the right auth check" and
  "this resolver's query is correct" are independent things to verify.

### 6. PDF generation broken (invoices/payslips/POs), one event mis-routed (commit `b6359e8`)

Found live, from worker logs, immediately after step 5 deployed — a second
confirmation the audit wasn't exhaustive.

- **`companies.city`/`companies.country`** have never existed, but
  `fetchInvoiceData`/`fetchPayslipData`/`fetchPOData` (3 call sites in
  `outbox-processor.ts`) all select them for the PDF letterhead —
  `packages/pdf/src/templates/{base,invoice,purchase-order}.ts` all render
  `company.city`/`company.country`. **Every invoice, payslip, and PO PDF
  generation has been failing.** Added migration `179_companies_city_country.sql`.
  `country` defaults to `'Iraq'`: every company row today has
  `country_code='IQ'`, and `invoice.ts`/`purchase-order.ts` already hardcode
  `", Iraq"` in their letterhead rather than using a dynamic value, so this
  matches existing behavior for those two templates.
- **`PO_PDF_REQUESTED`** was enqueued with `service='worker'`
  (`services/procurement/src/routes/orders.ts`), but its handler
  (`handlePOPDF`) lives in `deliverToReporting`, which only runs for
  `service='reporting'` events — `deliverToWorker`'s switch only knows
  `FX_SYNC_REQUESTED`. **A genuinely different bug class from everything
  else in this doc**: not a phantom column, a routing mismatch (right
  handler exists, wrong `service` value at the enqueue site). Confirmed no
  other event uses `service='worker'` besides `FX_SYNC_REQUESTED` (correct),
  so this was the only mis-routed one — but the check was manual
  (grep every `INSERT INTO service_outbox` call site and cross-reference
  its `service` value against where that event type is actually handled);
  nothing in the schema-audit tooling catches this class of bug at all,
  since there's no schema involved.

## Current confirmed state

- Commits `278765d` through `faed027` are confirmed live on the VPS (real
  deploy + real DLQ retry test). Everything from `db25853` onward
  (notifications/outbox-monitor, PDF/routing fixes) was pushed after that
  confirmation — **check the Actions tab / ask the user before assuming
  it's deployed**, don't take it on faith just
  because it's in this table.
- Full `pnpm test --concurrency=1` passes 29/29 tasks locally from a cold
  cache in ~50s.
- Both `dev` and `production` branches are in sync at `b6359e8`.

| Commit | What |
|---|---|
| `60987cf`–`173a102`–`eee7b06` | Finance/hr/inventory test FK-ordering fixes |
| `99c4199` | fx-sync test mock fix |
| `f677186` | Sidebar/format.ts fixes |
| `ce2179a` | Auth session wildcard-delete + middleware 401-masking fix, 8-service fileParallelism |
| `a10d25d` | turbo.json envMode fix |
| `c06799c` | CI seed step |
| `0791b59` | Redis service container, WHT compliance dead-column fix |
| `278765d` | `createVendor` fix |
| `3f79e6c` | 10-query schema audit |
| `fce0003` | Perf tests excluded from blocking gate |
| `dcf7f71` | `--concurrency=1` |
| `faed027` | 6 duplicate-resolver auth bugs |
| `db25853` | `notifications.push_sent` (worker-wide), outbox stuck-event detection |
| `b6359e8` | `companies.city`/`country` (PDF generation worker-wide), `PO_PDF_REQUESTED` mis-routing |

## Known open items (deliberately deferred, not forgotten)

1. **Residual shared-fixture test race, structurally unresolved.** Every
   service's tests use the same hardcoded `TEST_COMPANY_ID` against one DB.
   `--concurrency=1` makes this very rare but doesn't eliminate it. The real
   fix — unique per-run `TEST_COMPANY_ID` or an isolated schema per service —
   is a bigger rework, explicitly out of scope for this cleanup. If
   `--concurrency=1` ever stops being reliable too, that's the signal to
   finally do it.
2. **~5,000+ non-auto-fixable lint findings**, from earlier in this session.
   Deliberately deprioritized in favor of test/deploy reliability. Still
   outstanding, still not urgent.
3. **Local `fnc_erp_dev` has undocumented schema drift.** At minimum, a
   manual `ALTER TABLE vendors` at some point added `withholding_tax_type`
   and made `withholding_tax_rate` nullable — neither ever captured in a
   migration. Only the specific drift that caused visible bugs was found and
   corrected (by matching code to a freshly-migrated DB, not by fixing dev
   itself beyond re-running `pnpm migrate`). **Do not trust `fnc_erp_dev` as
   representative of production schema** — verify against a fresh
   `migrate:test`-only database when in doubt. There may be more drift never
   discovered because it never happened to cause a visible failure.
4. **6 more duplicate resolver keys in `resolvers.ts`**, confirmed harmless
   (see above) but still present as a trap for whoever next edits the wrong
   copy. Not fixed because there was no bug to fix, but worth deleting for
   clarity if anyone's back in that file.
5. **The duplicate-key audit was reactive, not exhaustive.** It covered the
   base-vs-phase5 split in `services/gateway/src/graphql/resolvers.ts`
   specifically, because that's where the bug report pointed. Whether this
   shadowing pattern exists elsewhere in the codebase (other files with a
   similar "phaseN" merge pattern) hasn't been checked.
6. **The schema audit's script isn't saved anywhere persistent.** It was
   written ad hoc in a scratchpad during the session and not committed. If
   this needs repeating against a newer snapshot of the codebase, the
   approach is: dump `information_schema.columns` from a freshly-migrated
   DB, regex-extract `alias.column` references from every `query(\`...\`)`
   call across the codebase (tracking `FROM`/`JOIN` clauses to map aliases
   to table names), cross-check against the real schema, then manually
   verify each hit (there will be false positives from subqueries/CTEs the
   simple parser doesn't understand) before trusting or fixing anything.
7. **The schema audit was confirmed non-exhaustive, not just theoretically
   incomplete.** Within minutes of the audited fixes going live, two more
   bugs from the exact same family turned up from normal use of the DLQ
   admin panel (`notifications.push_sent`, `service_outbox.updated_at` — see
   step 5 above) — one of them broke **every notification the worker has
   ever tried to send**, for however long `push_sent` has been in those
   INSERT statements. The original regex-based sweep likely missed these
   because they either didn't match its `alias.column` pattern cleanly (bare
   `INSERT INTO notifications (..., push_sent)` column lists, no table
   alias) or were structurally outside what it walked (`services/worker`
   wasn't necessarily covered the same way `services/gateway` and
   `services/finance` were). **Do not assume the codebase is now clean of
   this bug class.** If you have spare cycles, rerunning the audit with the
   script extended to also catch bare `INSERT INTO table (col1, col2, ...)`
   column lists (not just `alias.column` SELECT/WHERE references) would
   likely find more. `services/worker/src/jobs/outbox-processor.ts` in
   particular (`companies.city`/`country`, step 6) suggests `services/worker`
   specifically may not have been covered as thoroughly as `gateway`/
   `finance` were — worth a dedicated pass over that one file alone.
8. **A second, entirely different bug class exists that no schema audit will
   ever catch: outbox event routing mismatches.** `PO_PDF_REQUESTED` (step 6)
   was enqueued with the wrong `service` value — the handler existed and was
   correct, it just never got dispatched to. This has nothing to do with
   columns or tables, so the audit script is structurally blind to it. The
   only way it was found was by manually cross-referencing every
   `INSERT INTO service_outbox (service, event_type, ...)` call site's
   `service` value against the `switch (event.service)` dispatch in
   `services/worker/src/jobs/outbox-processor.ts` (~line 569) and each
   sub-dispatcher's own `switch (event.event_type)`. This has only been done
   once, reactively, for one event type. **Every other event type enqueued
   anywhere in the codebase could have the same mismatch and nothing has
   verified otherwise** — a full pass (grep every `INSERT INTO service_outbox`
   call site, map `event_type` → intended handler → which `deliverToX`
   function actually contains a matching `case`, confirm the enqueue's
   `service` argument routes there) has not been done.

## If you're picking this up

Start by confirming the state above is still accurate — `git log`, check the
last few Actions runs, and re-run `pnpm test --concurrency=1` locally before
assuming anything. Then decide whether to tackle one of the open items above
or move on to new feature work; none of them are blocking.
