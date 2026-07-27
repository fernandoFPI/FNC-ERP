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

### 7. Outbox Monitor payload always null; 5 more journal-entry inserts crashing on a parameter-type conflict (commit `3aff222`)

Found live, from the Outbox Monitor UI itself (user expanded "Details" on a
pending event and saw `Payload: null`) plus a fresh worker log
(`INVOICE_PAYMENT_JOURNAL_REQUESTED` failing 5 attempts deep with
`column "source_id" is of type uuid but expression is of type text"`) —
a third round of live discovery after steps 5 and 6, each a genuinely
different bug shape from the last.

- **`outboxEvents` resolver never selected `payload`.** Its `SELECT`
  explicitly listed columns (`id, service, event_type, status, attempts, ...`)
  and simply never included `payload`, so `r.payload` was always `undefined`
  → mapped to `null` in every API response, regardless of what's actually
  stored in the row. This is a distinct bug shape from steps 3/5/6 (which
  were all phantom columns that don't exist) — here the column exists and
  has real data, the SELECT just never asked for it. Added `payload` to the
  column list.
- **Reused SQL parameter with conflicting inferred types**, in 5 of 6
  journal-creation functions in `services/worker/src/jobs/outbox-processor.ts`
  (`createPaymentJournal`, `createVendorInvoiceJournal`, `createMOJournal`,
  `createRentalInvoiceJournal`, `createPayrollJournal` — `createVendorPaymentJournal`
  was already unaffected, it happens to pass the id as two separate
  parameters instead of reusing one). Each builds a `journal_entries` INSERT
  like:
  ```sql
  VALUES ($1,'PAY-' || LEFT($2::text,8),'Invoice payment',$3,'posted','invoice_payment',$2,$4)
  ```
  `$2` is used twice: once explicitly cast `::text` (to truncate it into the
  human-readable `reference` string), and again bare as the value for
  `source_id`, a `UUID` column. Postgres infers one type per parameter
  number for the whole statement — the explicit `::text` cast wins, so `$2`
  becomes text-typed everywhere, and Postgres has no implicit or assignment
  cast from `text` to `uuid`. Every one of these 5 event types
  (`INVOICE_PAYMENT_JOURNAL_REQUESTED`, `VENDOR_INVOICE_JOURNAL_REQUESTED`,
  `MO_JOURNAL_REQUESTED`, `RENTAL_INVOICE_JOURNAL_REQUESTED`,
  `PAYROLL_JOURNAL_REQUESTED`) has been failing and retrying into the DLQ.
  Fixed by adding an explicit `$2::uuid` cast at the `source_id` occurrence
  in each. Reproduced the exact reported error against a live DB with the
  original query first, then confirmed all 5 fixed queries succeed, before
  shipping — see verification note in open items below for why this class
  of bug also wasn't caught by the earlier schema audit (it's not a schema
  problem at all — every column referenced is real).

### 8. Full audit of every `service_outbox` enqueue site (commit `1e4d40c`)

This is the full pass promised by open item 8 above, done in response to a
direct request to complete it rather than reactively. Method: grepped every
`INSERT INTO service_outbox` call site across the codebase (~45 static
literals plus 4 dynamic-`event_type` helper functions in
`services/procurement/src/lib/po-helpers.ts` and inline calls in
`services/projects/src/routes/projects.ts`, whose actual `type:` values were
traced back to every caller), then cross-referenced every `(service,
event_type)` pair against `deliverEvent`'s `switch (event.service)` and each
`deliverToX` function's `switch (event.event_type)` in
`services/worker/src/jobs/outbox-processor.ts`. Found 3 more gaps, each a
different shape:

- **`CLIENT_DOCUMENT_EMAIL` / `ENGINEERING_REVISION_EMAIL`** (enqueued by
  two gateway resolvers, on client-document upload and engineering-revision
  issue) had no `case` in `deliverToNotifications` at all. Unlike the
  finance/inventory/interco dispatchers (which `throw` on an unmatched
  event_type, guaranteeing a DLQ entry), `deliverToNotifications`'s
  `default` branch is `log.warn(...)` with **no throw** — meaning the event
  is marked `processed` successfully and vanishes with only a log line
  nobody was watching. **The single quietest failure mode found this
  session**: no retry, no DLQ entry, no error surfaced anywhere in the
  admin UI. The email templates (`renderClientDocumentEmail`,
  `renderEngineeringRevisionEmail`) already existed in `@fnc-erp/email` and
  matched the enqueued payload shape exactly — they were built and exported
  but never imported into the worker. Wired up both cases.
- **`PO_COMPLETION_JOURNAL_REQUESTED`** (enqueued by
  `services/procurement/src/routes/orders.ts`'s REST `POST /:id/complete`)
  had no case in `deliverToFinance` — falls to `default: throw`, so every
  completion through this endpoint has been failing into the DLQ. Traced
  down that `apps/web` actually completes POs via a **different**, GraphQL
  `completePO` mutation in the gateway, which posts the same "project cost
  from PO completion" journal **synchronously in-transaction** via a
  `postPOCompletionJournal` helper — so the frontend path was never broken,
  but the REST endpoint (exposed, permission-gated, presumably meant for a
  future client or integration) silently never posts its journal entry.
  Added `createPOCompletionJournal` to the worker, a faithful async port of
  `postPOCompletionJournal`'s logic (same account-lookup, same guard against
  non-project/non-analytic POs, same debit/credit lines), reading from the
  outbox payload instead of a live transaction client.
- **`PAYSLIP_GENERATION_REQUESTED`** has a fully-built handler
  (`handlePayslipPDF`) and a seeded retry policy in migration 026, but
  **nothing has ever enqueued it**. `services/hr/src/routes/payroll.ts`'s
  payroll-processing loop computes a `payslipId` (from the `payslips`
  INSERT) per employee, then — inside the one `if` branch that happened to
  still reference it — explicitly discarded it with `void payslipId`. No
  payslip PDF has ever been generated or emailed for any payroll run in
  this system's history. Replaced the `void payslipId` with the missing
  outbox enqueue (`payroll_line_id`, `payroll_run_id`, `employee_id`,
  `company_id` — matching `handlePayslipPDF`'s exact parameter order,
  confirmed by reading its call site in `deliverToReporting`).

Two harmless, pre-existing dead `case`s were found and deliberately left
alone: `MILESTONE_REACHED` (in `deliverToNotifications`'s case list, but
`services/projects/src/routes/milestones.ts` writes directly to the
`notifications` table, bypassing the outbox entirely — the case is simply
unreachable, not broken) and `BACKUP_FAILED` (no enqueue site found
anywhere in the codebase). Neither causes incorrect behavior, so neither was
touched.

Every enqueue site checked in this pass now has a live, correctly-routed
handler. Verified `createPOCompletionJournal`'s full query chain (both
`journal_entries` and `journal_lines` inserts, plus the `journal_po_links`
FK) end-to-end against the live DB inside a rolled-back transaction using a
real project's `analytic_account_id` — not just a syntax check — before
shipping.

### 9. Outbound email replaced: SMTP/nodemailer → Microsoft Graph API OAuth2 (commit `728e102`) — CONFIRMED WORKING LIVE

Not a bug fix — a deliberate architecture change, requested directly. Production
mail had been failing with `535 5.7.139` ("basic authentication is disabled"):
Microsoft has disabled SMTP AUTH with username/password across virtually all
Exchange Online tenants. Rather than patch around it with SMTP+XOAUTH2 (still
needs SMTP AUTH re-enabled per mailbox, plus a refresh token that has to be
kept alive forever), replaced the entire sending path with Microsoft Graph's
`POST /users/{sender}/sendMail` using app-only client-credentials auth
(`@azure/msal-node`) — no SMTP protocol involved, no refresh token to rotate.

`packages/email`'s public `sendEmail(message, config?)` signature was kept
identical, so none of the ~15 call sites across `services/worker` and
`services/gateway` needed to change — only `packages/email/src/{client,sender}.ts`
internals and the config shape (`SmtpConfig{host,port,secure,user,password}`
→ `EmailConfig{tenantId,clientId,clientSecret,senderAddress}`). Config keys
renamed everywhere: `smtp.*` → `msgraph.{tenant_id,client_id,client_secret,
sender_address}` (env vars, `system_config` DB layer, gateway admin
`KNOWN_KEYS`, the Integrations page UI, `/test-smtp` renamed to `/test-email`).

Verified before shipping: full monorepo build clean, full test suite green
under `--concurrency=1`, and exercised the real MSAL client-credentials flow
against `login.microsoftonline.com` with placeholder credentials — got back
a genuine `AADSTS90002` (tenant not found) response, proving the request
plumbing was correct even without real Azure credentials at the time.

**The user has since completed Azure AD app registration and confirmed a
real test email sent successfully in production ("IT WORKS!!!").** This is
now the *only* fully user-confirmed-live piece of work in this entire doc —
everything else in this table is "shipped, build/test verified" but not
independently confirmed working in production by the user, per the
discipline established below. Treat this one differently: it's proven.

One gotcha hit and resolved along the way, worth remembering for any future
Azure app credential rotation: Azure Portal's Certificates & secrets page
shows both a **Secret ID** (a permanent, harmless-looking GUID) and a
**Value** (the real credential, shown exactly once at creation and
permanently masked after). Pasting the Secret ID instead of the Value
produces `AADSTS7000215: Invalid client secret provided` — easy mistake,
only fixable by generating a fresh secret if the Value wasn't saved.

### 10. Two more live UI/data bugs surfaced once real data started flowing through the fixed paths (commits `e5bb675`, `c8b0745`, `6d912c6`)

Both found by the user directly using the app after step 7/9 landed — not
from logs this time, from clicking around.

- **Outbox Monitor "Details" crashed with a minified React error #31**
  ("Objects are not valid as a React child") the moment a real (non-null)
  payload appeared. `apps/web`'s `OutboxMonitorPage.tsx` was written back
  when `payload` was always `null` (step 7's bug) — its render code did
  `JSON.parse(ev.payload)`, assuming a JSON-encoded *string*. The GraphQL
  `JSON` scalar actually delivers `payload` as a real parsed *object*;
  `JSON.parse(object)` throws, and the `catch` fallback returned the raw
  object as a JSX child, which React refuses to render. Fixed to
  `JSON.stringify` objects directly, only attempting `JSON.parse` first if
  `payload` is genuinely a string. `DLQPage.tsx` has the identical
  `payload: string` type but never actually renders the field anywhere —
  checked, confirmed dead/unused, left alone.
- **Invitation emails linked to the literal string `"undefined"`.** Two
  separate code paths enqueue `USER_INVITATION_EMAIL` with *different*
  payload key names: `services/auth/routes/user-management.ts` (a REST
  endpoint, confirmed unused by `apps/web` or the mobile app — nothing
  calls it) sends `invitationUrl` + `invitedBy` (a user id); the gateway's
  `inviteUser` GraphQL mutation — the one `apps/web`'s Users page actually
  calls — sends `inviteUrl` + `invitedByName` instead. The worker's email
  handler only ever read `p['invitationUrl']`, so the real (gateway) path
  always got `undefined`, and `String(undefined)` became the literal href.
  Fixed the handler to accept both key names. While in there, also fixed
  the gateway's `inviteUser` resolver: it was sending the inviter's raw
  **email address** as `invitedByName` (`SELECT email FROM users...`, no
  name lookup) rather than their actual name — now selects
  `first_name`/`last_name` and only falls back to email if unset, matching
  the pattern the worker's legacy fallback already used.
  **Note on process**: the first attempt at the inviter-name fix (commit
  `fe7ff79`) misread the request and did the *opposite* of what was asked
  (hardcoded "An administrator" instead of showing the real name) — caught
  immediately by the user and corrected in `6d912c6`. Recorded here as a
  reminder to re-read ambiguously-phrased requests carefully before editing.

Checked whether the "two enqueue sites, inconsistent payload shape" bug
class (found above) exists anywhere else: `INTERCO_STOCK_TRANSFER_EXECUTE`
is the only other event type with more than one enqueue site
(`services/worker/src/jobs/interco-stock-transfer.ts` and
`services/interco/src/routes/stock-transfers.ts`) — compared both payloads
field-by-field, including the nested `lines[]` shape; they match exactly.
No other event type has multiple producers. This was a manual one-off
check, not added to any repeatable script — see open item 11 below.

### 11. The invitation-accept flow was blocked at the gateway the entire time — a fourth, distinct bug layered under the other two (commit `19f5a8f`)

After step 10's URL fix, the user clicked a real (non-"undefined") invitation
link and got **"This invitation link is invalid or has expired"** — a
generic error `AcceptInvitationPage.tsx` shows for *any* failed request
(401, 404, 500, or an actually-bad token; its `.catch()` doesn't
distinguish). That ambiguity is itself worth remembering — it means this
exact user-visible message can point to several unrelated root causes.

Root cause: `services/auth/routes/user-management.ts`'s two accept-invitation
endpoints (`GET .../accept-invitation/validate`, `POST .../accept-invitation`)
are correctly implemented as public — explicitly commented "no JWT
required," since the invitee has no account yet. But
`services/gateway/src/app.ts`'s `PUBLIC_PATHS` allowlist (the list of paths
exempted from the gateway's blanket JWT-validation middleware) never
included them. Every request hit `requireAuth()` and got a 401 before ever
reaching the auth service — completely independent of, and layered
underneath, the URL-mismatch bug fixed in step 10. **This means the
invitation-accept flow has likely never worked in production**; the earlier
"undefined" link bug just meant nobody ever got far enough to hit this one.

Fixed by adding `/api/v1/auth/users/accept-invitation` to `PUBLIC_PATHS` —
its existing `startsWith(p + '/')` prefix-matching logic also covers the
`/validate` sub-route with that one entry. Verified with the actual matcher
function (not just reading it) that both target paths now pass and that
adjacent sensitive paths (`/api/v1/auth/users`, `/api/v1/auth/users/invite`)
correctly still don't.

**Update: it did not work first try — three more bugs found in the same flow,
one at a time, each confirmed live by the user before moving to the next.**
This turned into the most heavily-stacked bug chain of the whole session —
six real, independent bugs in one feature, each masking the next:

- **Commit `2029ec4`** — accepting the invite crashed with React error #31
  again, args `{code, message}`. Same bug shape as step 10:
  `AcceptInvitationPage.tsx`'s submit handler typed `response.data.error` as
  a plain string, but every service's `sendError()` helper
  (`services/*/lib/errors.ts`) responds `{success:false, error:{code,
  message,details}}` — an object. Fixed to read `.error.message`.
- The now-visible real error was `PASSWORD_MISMATCH` despite the user typing
  the same password twice. **Commit `d03e8c7`** — the POST body only ever
  sent `{token, password}`; `confirmPassword` was validated client-side
  (`passwordsMatch`) but never included in the actual request, so the
  backend always compared the real password against `undefined`. This
  endpoint had rejected every single submission, ever, regardless of input.
- Along the way, investigating a hypothesis that turned out wrong
  (`user_company_roles.module` being `NOT NULL`, checked directly against
  live `information_schema` and found nullable — a later migration had
  dropped the constraint the original migration file implies) surfaced a
  **different real bug**: `packages/auth/src/middleware.ts`'s
  `requireModule()` treats `module !== 'all'` as denied for everyone except
  `system_admin`. Since the Invite User UI never collected a module value,
  every invitation's module was `NULL` — meaning any invited non-admin user
  who did make it through signup would've been silently locked out of every
  module-gated endpoint afterward. **Commit `345d46f`** defaults module to
  `'all'` (the sentinel used everywhere else in the codebase — seeds, test
  fixtures) both when invitations are created and when they're accepted (so
  already-pending invitations get the fix too, no resend needed).
- After all of this, the invite finally completed successfully — **user
  confirmed live**, first fully-completed invitation in this system's
  history.

### 12. Post-fix cleanup: role vocabulary bug, multi-company invites, Users-list stubs (commit `7dc49c7`)

Three issues reported once the invite flow was finally working:

- **Confirmed real bug, not cosmetic**: Invite User's role dropdown offered
  `viewer`/`manager`/`company_admin`/`system_admin`; Add Role (existing
  user) offered `system_admin`/`company_admin`/`module_admin`/`user`. The
  entire permission system only recognizes the second vocabulary —
  `packages/auth/src/middleware.ts`'s `requireRole()` hierarchy
  (`{user:0, module_admin:1, company_admin:2, system_admin:3}`) has no entry
  for `viewer`/`manager`, so `roleHierarchy[role] ?? -1` evaluated to **-1**
  for both — below even the lowest real tier. Anyone invited as "Viewer" or
  "Manager" would fail every `requireRole()` check, worse off than a plain
  "User". Fixed both the Invite User and (separately, same bug) Create User
  modals to use the real vocabulary. Confirmed via `requirePermission`
  (`packages/permissions/src/middleware.ts:112`) that non-admin roles start
  with zero permissions by design regardless — a freshly-created "User"
  looking inert until permissions are explicitly granted is expected
  behavior, not a bug.
- **Multi-company invites** (explicit design decision via AskUserQuestion —
  user picked "one invite, multiple companies" over "fire N separate
  invites"): added migration `180_user_invitation_companies.sql`, a junction
  table so one invitation token grants roles across several companies at
  once. Rewrote `inviteUser` (input now `companies: [{companyId, role,
  module}]`), `userInvitations`, and both `services/auth` accept-invitation
  endpoints to read/write the junction table. `user_invitations.company_id/
  role/module` (already nullable) are left in place but no longer written
  to — no destructive migration needed. Frontend: `UsersPage`'s Invite modal
  gets a checkbox multi-select for companies (one role applied to all
  selected companies, not per-company roles — kept simple since that's what
  was asked for); `AcceptInvitationPage`/`InviteHistoryPage` updated to show
  a list of companies instead of one.
- **Settings → Users "Sessions" always read 0** — and Companies/Roles in
  that same list were also always empty, just not yet noticed. The `users`
  query resolver (`services/gateway/src/graphql/resolvers.ts`) hardcoded
  `activeSessions: 0, companies: [], roles: []` and never queried for them —
  the exact same "stub never wired up" shape as several other bugs this
  session. Added two batched queries (session counts + `user_company_roles`
  join, both `WHERE user_id = ANY($1::uuid[])`) keyed by the page's user
  ids, avoiding N+1 queries.

Verified: full monorepo build clean; gateway/auth/web test suites green
(279 tests total); migration applied to a live DB; the entire multi-company
invite → validate → accept chain exercised end-to-end inside a rolled-back
transaction against real data (2 companies, 2 different roles, correct
`user_company_roles` rows produced). **Not yet confirmed live by the user** —
this is the newest work in the doc.

Swept for the same bug class immediately after: checked every route across
all 7 files in `services/auth/src/routes/*.ts` for ones without
`requireAuth()`, and cross-referenced each against `PUBLIC_PATHS`. Confirmed
8 total no-auth routes exist in the auth service (login, mfa/verify,
refresh, forgot-password, reset-password + validate, and the two
accept-invitation routes) — all 8 are now covered. This was the only gap.
Scope note: this sweep only covered `services/auth`; the same "route is
intentionally public but the gateway doesn't know it" pattern was not
checked against any other service's routes (finance, procurement, etc. —
though none of those have a plausible no-account-yet public flow the way
auth does, so the risk there is much lower).

## Current confirmed state

- Commits `278765d` through `faed027` are confirmed live on the VPS (real
  deploy + real DLQ retry test). The Microsoft Graph email migration
  (`728e102`) is **also independently confirmed live** — the user completed
  Azure AD setup and a real test email sent successfully. Everything else
  from `db25853` onward was pushed after `faed027`'s confirmation and has
  only build/test verification, not a user-confirmed live check — **check
  the Actions tab / ask the user before assuming it's deployed**, don't take
  it on faith just because it's in this table.
- Full `pnpm test --concurrency=1` passes 29/29 tasks locally from a cold
  cache in ~50s; re-verified individually after each subsequent change
  (`services/worker`+`services/hr` after step 8, `services/worker`+
  `services/gateway`+`services/auth` after step 9, `services/worker`+
  `services/gateway` after step 10 — all green).
- Both `dev` and `production` branches are in sync at `7dc49c7`.
- **The invitation flow is now confirmed fully working end-to-end by the
  user** (`d03e8c7` — first successful acceptance in this system's history),
  after six stacked bugs (URL key mismatch, inviter-name field, gateway
  auth-gating, error-rendering crash, missing confirmPassword field, and a
  module='all' permission-lockout bug) were found and fixed one at a time.
- Commit `7dc49c7` (multi-company invites, role vocabulary fix, Users-list
  stub fix) is the newest work — build/test verified and one full
  invite→accept cycle exercised against a live DB, but **not yet confirmed
  live by the user**. Don't assume the multi-company path specifically
  works in production until someone actually sends and accepts one.

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
| `3aff222` | Outbox Monitor payload always null; 5 journal-entry inserts crashing on uuid/text parameter reuse |
| `1e4d40c` | Full service_outbox enqueue-site audit: 2 silently-dropped emails, 1 DLQing journal, 1 never-fired payslip PDF job |
| `728e102` | **SMTP → Microsoft Graph API OAuth2 email migration — CONFIRMED LIVE by user** |
| `e5bb675` | Outbox Monitor "Details" React crash on real (non-null) payloads |
| `c8b0745` | Invitation emails linking to literal "undefined" — payload key mismatch across 2 enqueue sites |
| `fe7ff79` | Invitation email inviter-name change — **misread the request, reverted** |
| `6d912c6` | Corrected: invitation email shows real inviter name; gateway's inviteUser now resolves a real name instead of raw email |
| `19f5a8f` | Gateway was 401-blocking both accept-invitation endpoints — likely the reason invitations have never fully worked in production |
| `2029ec4` | Accept-invitation submit crash (React error #31) — same error-shape mismatch as the Outbox Monitor |
| `d03e8c7` | Accept-invitation always failed PASSWORD_MISMATCH — confirmPassword never sent to the backend. **First fully successful invite acceptance ever — CONFIRMED LIVE by user** |
| `345d46f` | Invitations' module always NULL — silently locks out invited users at every module-gated endpoint; default to 'all' |
| `7dc49c7` | Multi-company invites (migration 180); fixed viewer/manager phantom-role bug; fixed Users list Sessions/Companies/Roles always-empty stubs |

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
8. ~~A second, entirely different bug class exists that no schema audit will
   ever catch: outbox event routing mismatches.~~ **DONE — see step 8 above
   (commit `1e4d40c`).** The full pass was completed: every
   `INSERT INTO service_outbox` call site (static and dynamic) was
   cross-referenced against every `deliverToX` dispatcher's `switch`. Found
   and fixed 3 more gaps (2 silently-swallowed emails, 1 DLQing journal, 1
   handler that was never triggered at all). As of `1e4d40c`, every known
   enqueue site has a live, correctly-routed handler — but see item 9 below:
   this was a one-time pass, not a standing check, so any *new* event type
   added later needs the same manual cross-reference repeated by hand.

9. **A third bug class exists that neither the schema audit nor the
   outbox-routing check would ever catch: reused query parameters with
   conflicting inferred types.** Step 7's `source_id` crashes weren't a
   missing/renamed column (schema audit) or a misrouted event (open item 8)
   — every column involved is real and correctly named; the bug is that one
   `$N` placeholder was used both with an explicit `::text` cast and bare
   against a `uuid` column in the same statement, and Postgres unifies a
   parameter's type across the whole query. This was found by reading one
   flagged function and then manually checking the other 5 sibling
   `journal_entries` INSERTs in the same file for the same shape — it was
   **not** a systematic search of the codebase for this pattern (e.g.
   `grep`-ing for any `$N` that appears both with a cast and without one).
   Whether this exact pattern recurs outside `outbox-processor.ts`'s journal
   functions (other files reuse a UUID both in a derived string and as a
   raw column value) has not been checked.
10. **The three live-discovery rounds in steps 5–7 form a pattern worth
    naming explicitly**: each deploy surfaced a *new class* of bug (phantom
    columns → routing mismatch → under-selected column + parameter-type
    conflict), not more instances of the same one. That strongly suggests
    there are more classes still hiding, not just more instances of classes
    already found. Don't treat "we fixed the thing the last log showed" as
    evidence the surrounding code is now safe — treat it as evidence this
    codebase has never been exercised by real traffic before, and budget for
    more rounds like this, not fewer.

## If you're picking this up

Start by confirming the state above is still accurate — `git log`, check the
last few Actions runs, and re-run `pnpm test --concurrency=1` locally before
assuming anything. Then decide whether to tackle one of the open items above
or move on to new feature work; none of them are blocking.
