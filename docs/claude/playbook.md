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
20. **New document_attachments entity_type → also widen its CHECK constraint.** Wiring a new
    entity_type into `verifyAttachmentEntityOwnershipGW` and `entityAttachments`'s union query
    (resolvers.ts) is not enough — `document_attachments.entity_type` has a separate allow-list CHECK
    constraint (`document_attachments_entity_type_check`), rewritten additively by a long chain of
    migrations (117, 135, 171, 188, 201, 233, 264, 284, 293...). Missing it throws at insert time:
    `new row for relation "document_attachments" violates check constraint
    "document_attachments_entity_type_check"` (hit live when wiring expense_claim/expense_claim_line
    receipt attachments — fixed in migration 293). Before trusting a new entityType end-to-end, grep
    `document_attachments_entity_type_check` across migrations and add a new migration with the full
    current list plus the new value(s), same pattern as migration 284.
22. **A removed position check can silently orphan real `po_position_assignments` rows.**
    `procurement_2nd` was a real, dedicated position gating PO/Requisition price_verification
    (migration 030). A later refactor (commit 081bae3, accidentally entangled via a pathspec
    `git commit` quirk, then redone properly in f82efe5) replaced the check with organizer-or-
    admin on both PO and Requisition, and dropped `procurement_2nd` from the assignable
    `PO_POSITIONS` list (po-constants.ts) — but never touched existing `po_position_assignments`
    rows. Found live: 6 active rows, all one real employee (Nadia Saleh, scoped per-department),
    silently unchecked and unmanageable (not in the Settings UI list) ever since. The DB
    `position` CHECK constraint (migration 204) still allowed the value the whole time — nothing
    errored, it just quietly stopped mattering. Fixed by reverting Requisition's gate back to
    `userHasPositionForRequisitionGW(...,'procurement_2nd')` and re-adding it to `PO_POSITIONS`;
    left PO's gate on organizer (narrower scope, user's explicit choice). Before removing or
    replacing ANY position-based (or role-based) authorization check, query
    `po_position_assignments` (or the equivalent table) grouped by that value for real rows, not
    just grep the app code — the app layer can go quiet while the data stays live.
21. **`po_line_purchases.receipt_attachment_id` points AT `document_attachments.id`.** Every other
    attachment consumer just tags a row by `entity_type`/`entity_id`; this is the one FK that goes the
    other way, no `ON DELETE` action. Deleting the referenced `document_attachments` row without
    clearing/reassigning this column first throws `violates foreign key constraint
    "po_line_purchases_receipt_attachment_id_fkey"`. Already fixed once in `rejectTolerancePurchase`
    (delete `po_line_purchases` before `document_attachments` — that path deletes the whole purchase,
    so order alone works) but the SHARED `removeAttachment` helper (`packages/db/src/attachments.ts`,
    used by every `detachFile` call) still hit it for the "remove just one photo, keep the purchase"
    case — fixed there by nulling/promoting `receipt_attachment_id` before the delete. Any new code
    that deletes a `document_attachments` row needs to check this FK, not just assume entity_type/
    entity_id tagging is the only relationship.
23. **Two code paths for the same source_type can drift (one fixed, one not).** The worker's
    monthly `runMonthlyDepreciation` job already created 'depreciation' journal entries as
    'draft' (with `asset_depreciation_schedule.status='draft'` as an intermediate state, flipped
    to 'posted' later by `postJournalEntry`'s own source_type branch) — but
    `services/finance/src/routes/assets.ts`'s user-triggered `run-depreciation` REST endpoint,
    creating the exact same kind of entry, still inserted straight to 'posted' and skipped the
    'draft' intermediate schedule status entirely. Found while auto-posting ~20 journal_entries
    INSERT sites company-wide (now draft-first, Finance posts via the existing `postJournalEntry`
    + `finance.journals.approve` flow). Grep every `INSERT INTO journal_entries` for a given
    source_type, not just the first hit — a feature with both a scheduled job and a manual
    REST/GraphQL trigger is a classic place for the two to only get updated once.

24. **A worklist query that re-implements its action gates drifts from them.** The queue pages
    (`myRequisitionApprovalQueue`, legacy `myApprovalQueue`) each hand-wrote their own copy of
    "who can act on this stage", and the copies went stale: price_verification still routed to
    the organizer after the gate moved to `procurement_2nd` (so those holders saw nothing);
    position scope compared the CALLER's department instead of the organizer's, ignored branch,
    and treated a branch-only grant as company-wide (it matched every requisition); a department
    head matched on their own department so they saw ALL pending_approval items; `po_admin` and
    `company_admin` were missing. Symptoms: "my queue is empty though I hold the position", or a
    queue item that errors "Not authorized" when opened. Fix pattern: each queue branch must
    mirror, one for one, the mutation that leaves that stage (`userHasPositionForRequisitionGW`,
    `userIsDeptHeadForRequisitionGW`, `approveRequisition`, `hasProcurementAuthorityGW`), and
    whenever a gate changes, grep every queue/list that encodes the same rule. Regression test:
    `services/gateway/tests/requisition-queue-positions.test.ts` (one non-admin user per position).

25. **RTL (Arabic) layout and i18n conventions (apps/web).** `src/i18n` (i18next) sets `<html dir/lang>`
    on language change; the language is kept in `localStorage['fnc-language']`. In RTL work: never
    write physical `marginLeft/Right`, `paddingLeft/Right`, `borderLeft/Right`, `left:`/`right:` or
    `textAlign: 'left'|'right'` in new code. Use the logical forms (`marginInlineStart/End`,
    `borderInlineStart/End`, `insetInlineStart/End`, `textAlign: 'start'|'end'`). Exceptions that stay
    physical: viewport-coordinate popovers (`ListKit` RowMenu `left`) and `translateX` slides, which
    must be flipped by hand with `useIsRtl()` (Sidebar mobile drawer). Directional glyphs (`‹ ›`,
    arrows, chevrons) don't mirror by themselves: swap them with `useIsRtl()`. Non-component modules
    (`lib/po-constants.ts`, `lib/procurementStages.ts`) translate with `i18n.t(key, { defaultValue })`
    so an untranslated key falls back to the English label. Tab/stage *keys* stay English internally
    and only the displayed label is translated (`PanelTabs` `labels` prop). Arabic plurals need all six
    forms (`_zero _one _two _few _many _other`). Run `node` key-parity check (en vs ar) after adding
    keys. Backend strings (approval_log `action`, error messages) are still English.
    Tests: `apps/web/src/test-setup.ts` imports `./i18n`; without it `useTranslation()` renders raw key paths
    (`req.form.newRequisition`) in any test whose component tree doesn't happen to import the i18n module.
    Module-level label maps (status/priority/purpose) can't call the `t` hook: keep the English map as the
    `defaultValue` and translate at the use site with `i18n.t(key, { defaultValue })`. Never put a `t()` result in a
    `useMemo`/`useCallback` without `t` in its deps, or it keeps the old language after a switch. Text that is
    saved to the database (e.g. auto-filled rejection reasons) stays English on purpose.
    **Six traps found while bulk-translating (Finance, Projects, HR):**
    (a) *Never compare a value that came from `t()` against an English literal.* A nested ternary had its branches
    translated while later code did `execStatus === 'On Schedule'` (colour/health flag in `ProjectDetail`), and
    Finance label/value tuples did `k === 'Original Amount'`. In English everything still works, in Arabic the
    comparison silently goes false. Keep a stable key (`execKey = 'onSchedule'`) for logic and translate only at
    display, or compare against `t(...)` of the same key. Spot it: grep `(===|!==) '[A-Z]` in converted files.
    (b) *Codemods must not extract non-prose strings.* Hex colours (`text: '#1d4ed8'`), MIME types
    (`'image/svg+xml'`), document-type codes (`CAL`, `DRG`, `OTH`) and currency codes (`USD`) were turned into
    translation getters. They need no translation and a translated one corrupts the value. Grep
    `defaultValue: "#` and `defaultValue: "[a-z]+/` after any bulk run.
    (c) *Don't match translations on alnum-normalised English.* `Planned` and `Planned %`, `Start` and `▶ Start`,
    `Drawing #` and `+ Drawing`, `Advance` and `Advance #` all normalise to the same string, so one variant's Arabic
    (with its `+`/`*`/`:`/`%`) leaked into the other (33 Finance and 22 Settings/Admin keys were wrong, e.g. FX `Rate`
    showed "النسبة %", expense-claim `Advance` showed "رقم السلفة"). Match the exact English string first; the
    loose match is only a fallback and its collisions must be audited.
    (d) *A key slug that equals a CLDR plural word* (`hdr_other`) is read as the `_other` form of `hdr`, which fails
    the six-form Arabic parity test; `tlh()` now suffixes such slugs with `Text`.
    (e) *Raw enum values rendered as text bypass every codemod.* `<Badge>{claim.status}</Badge>`, `{r.purpose}`,
    `{p.punch_type}` and `status={req.status}` show the DB value (`approved`, `in_progress`, `full_time`) in English
    even in the Arabic UI, because there is no string literal to extract (57 sites across Finance, Inventory, Projects,
    HR…). Render them with `enumLabel(value)` (`src/i18n`): English returns the raw value unchanged, other languages read
    `enum.<value>`, unknown values fall back to the raw value, so it is always safe to wrap. Add new values to the
    `enum.*` group in both locale files. Never use the label for logic. Spot new ones by grepping for JSX children
    like `>{x.status}<` / `{r.type}` / `{p.punch_type}` that are not wrapped in `t(`/`enumLabel(`.
    (f) *A guard that matches on message text silently disappears in another language.* `PayrollRunForm` blocked
    "a posted run overlaps" with `overlapWarning.includes('Cannot')`; in Arabic the run could be created over a
    posted one. State the *kind* (`'posted' | 'overlap'`) and derive both the message and the guard from it
    (regression test `payroll.i18n.test.tsx`, runs in en and ar).

26. **A new i18n key pasted into the wrong nested namespace silently falls back to the raw key.** Both locale
    files are one giant object with many same-shaped sibling namespaces (`req.bought`, `req.detail`,
    `po.detail`, `perm.reg`, …) sharing lots of identically-named leaf keys (`create`, `status`, `cancel`,
    `couldNotPrepareUpload`…). Grepping for a neighboring key like `"couldNotPrepareUpload"` and inserting
    right after it can land the new key in a *different* namespace than the one the component actually reads
    from (`t('req.detail.coveredFromInventory')` resolved to nothing because the key got added under
    `req.bought` instead — same mistake recurred for `reply`/`replyCount`, which real users hit live:
    `req.detail.reply` literally printed on screen). i18next falls back to the raw key string with no error,
    so this never fails a build or typecheck. Fix/detection: after adding a key, verify the EXACT namespace
    object it landed in with a one-off Node script — `JSON.parse` both locale files, extract every
    `t('a.b.key'` usage from the touched component via a `t\('a\.b\.([a-zA-Z0-9_]+)'` regex scan, and confirm
    each resolves inside `en.a.b` / `ar.a.b` (treating an `_one`/`_other`/Arabic six-form suffix as present if
    any `key_*` sibling exists) — not just that the string exists *somewhere* in the file. Do this for every
    new key, not just the one the user happened to report.

27. **A `query()` read for a mutation's return value, called from inside `withTransaction`'s own callback,
    races the `COMMIT`.** `withTransaction(ctx, fn)` only runs `COMMIT` *after* `fn(client)` resolves
    (`packages/db/src/transaction.ts`); `fn`'s own writes go through the transaction's dedicated `client`,
    but the shared `query()` helper used for "fetch this row to return it" patterns (`getXForReturn(id)`)
    runs on a *different* pooled connection. Calling `getXForReturn(id)` as the last line *inside* `fn` reads
    on that other connection before the transaction committed, so under Postgres's default read-committed
    isolation it sees the pre-write row — found live in `approveProductCostChange`, which returned a
    `status: 'pending'` row immediately after the same function had just set it to `'approved'`, caught by a
    test asserting the mutation's own return value (not just the DB state after). Fix: let `fn` return only
    what's needed to build the follow-up query (or nothing), call `withTransaction(...)` without `return`ing
    its result directly, and do the `getXForReturn(id)` read as a separate statement *after* `await
    withTransaction(...)` has resolved. (A `getXForReturn` called with the transaction's own `client` instead
    of the shared `query()` helper would also work, but changes that helper's signature everywhere it's used.)

28. **A document number derived from `COUNT(*)+1` breaks the moment rows leave the set.** `nextClaimNumber`
    (`services/finance/src/routes/expense-claims.ts`) numbered expense claims as `COUNT(*)+1`. Three claims
    (0023 to 0025) were moved from Al Watanyia to Nishtimani Yakam, leaving Al Watanyia with 25 claims but a
    highest number of 0028. Count + 1 gave 0026, which already existed, so every submit in that company hit the
    `(company_id, claim_number)` unique key and returned a generic 500 "Failed to submit expense claim". The route
    catches everything into one message and the form shows only `error.message`, so the user saw no cause and the
    server logged nothing. How to spot it: one company fails on every submit while others work; compare
    `count(*)` with the highest suffix per company (`max_n > count`); the Network response carries
    `error.details.code = 23505` with a `..._claim_number_key` constraint. Fix: take the highest existing suffix
    plus one inside the submitting transaction under `pg_advisory_xact_lock` (regression test:
    `services/finance/tests/expense-claim-numbering.test.ts`). The same `COUNT(*)+1` pattern is still in
    `petty-cash.ts` (`nextReplenNumber`), the gateway resolvers and `worker/src/jobs/interco-stock-transfer.ts`;
    check each before trusting it, and prefer `nextDocumentNumber` (a real sequence) for new document types.

29. **Removing a service can leave its web callers behind, silent, plus a status list that drifted.**
    Commit 297fcf5 deleted the REST `services/procurement`, including `/procurement/purchase-orders/:id/returns`.
    The three Returns screens (`PurchaseOrderDetail` Returns tab, `POReturnForm`, `POReturnDetail`) kept calling
    it, and the list call ended in `.catch(() => { /* ignore */ })`, so the tab just looked empty instead of
    failing. On top of that, the "Create Return" gate was a hard-coded status list
    (`['received','invoiced','completed','payment_pending','closed']`) that had never been updated: `received` is
    not a status any more and `goods_received` was missing, so a PO that had just received its goods (e.g.
    NF-PO-2026-0083) could not start a return even before the missing backend mattered. Fix: returns are now
    GraphQL in the gateway (`poReturns`, `createPOReturn`, …) and the web gate is one shared constant
    (`PO_RETURNABLE_STATUSES` in `po-constants.ts`, mirrored in the gateway resolvers; change both together).
    How to spot it: a feature whose list is "just empty" for everyone; grep `apps/*/src` for the removed
    service's URL prefix, and for `.catch(() => {})` around an `api.get`. Before deleting a REST service, grep
    for every caller including ones that swallow errors. Hard-coded status arrays in JSX are a drift risk: lift
    them to a named constant next to the status vocabulary (`PO_STATUSES` / `CHILD_PO_STATUSES`).
    Regression test: `services/gateway/tests/po-returns.test.ts`.

30. **A web option list that drifts from what the backend accepts, behind a silent fallback, looks like "the
    dropdown doesn't change".** ProjectDetail's inline contract form (Contract Management tab) carried its own
    billing-method list (`lump_sum`, `remeasure`, `unit_rate`, `milestone_based`, `hybrid`), separate from the
    standalone `ContractForm`'s. The database only accepts four values (`project_contracts.default_billing_method`
    CHECK, migration 021), and the gateway's `updateProjectContract` maps the incoming value through a table with
    `?? 'fixed_lump_sum'` as the fallback, so every value it didn't recognise was saved as fixed lump sum with no
    error. The user saw the billing method "not changing" (screenshot: always "fixed lump sum"). Edit also
    pre-selected the wrong option, because the stored value (`milestone`, `progress`, `fixed_lump_sum`) wasn't in
    the dropdown at all. How to spot it: a select that saves without error but reads back as one fixed value; two
    forms for one entity with their own hard-coded option arrays; a `?? default` fallback on a value map in a
    resolver. Fix: one shared list in `apps/web/src/lib/contractBilling.ts`, used by both forms, with a test that
    pins it to the DB's four values and fails if either form defines its own again
    (`apps/web/src/lib/__tests__/contractBilling.test.ts`). Related to #24 and #29 (parallel lists drifting).
    The silent fallback itself is gone too: `createProjectContract`, `updateProjectContract` and
    `createProjectInvoice` now go through `resolveContractBillingMethod` / `resolveInvoiceBillingMethod`
    (`services/gateway/src/lib/contractBilling.ts`), which reject an unknown value with a clear error naming the
    allowed ones instead of storing `fixed_lump_sum` (`services/gateway/tests/contract-billing-method.test.ts`,
    real Postgres). Same class, same form: its contract status list offered `suspended` and `terminated`, which
    `project_contracts.status` (CHECK: draft/active/completed/cancelled) rejects, so picking either failed on
    save; it now uses `lib/contractStatus.ts`. Contracts can also now be tagged `remeasure` / `unit_rate` /
    `hybrid` (migration 306, contract level only): `project_invoices.billing_method` still allows only the
    four methods `packages/billing` can build lines for, so those three are labels, not invoice types, and the
    invoice resolver rejects them. Widen BOTH the CHECK and the resolver list together, and check what reads
    the column before assuming a new value does anything.

31. **A requirement fixed on one of two paths still bites on the other (vendor receipt asked for twice).**
    In a G1 requisition the buyer uploads the vendor's receipt while sourcing (Items Bought stores it per
    purchase: entity `po_line_purchase`, category `attachment`). At receiving, the Store In detail page and the
    server's `confirmReceipt` were taught to accept that, but the jobsite delivery form
    (`ReceiptForm.tsx`, project PO with `delivery_destination='jobsite'`, which skips Store In) still demanded
    a fresh "Vendor receipt (required)" photo, so users uploaded the same receipt twice (REQ-2026-0001 /
    NY-PO-2026-0026). The jobsite path's server mutation `recordDirectDelivery` checks no receipt at all, so only
    the form enforced it. How to spot it: a user "has to upload X again" after a stage change; grep every
    place that asks for the same document (`po_receipt_document`, `vendor_receipt`) and compare their rules.
    Fix: one shared rule, `hasBuyerReceipt` in `apps/web/src/lib/buyerReceipt.ts`, used by both pages (it counts a
    `po_line_purchase` attachment, or category `po_receipt_document`, and deliberately not the PO page's
    "Delivery Photos", category `attachment` on the PO itself); the buyer's receipt now fully satisfies the
    requirement and the form says so. Tests: `lib/__tests__/buyerReceipt.test.ts` and
    `pages/procurement/receipts/__tests__/ReceiptForm.test.tsx`. Related to #23 (two paths for one thing).
