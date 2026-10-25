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

32. **A UI-only bypass of a server-enforced check is a button that still gets refused; a bypass of a check the
    server never made can't be proven, only declared.** Goods receipts need a vendor receipt and a materials
    photo. `confirmReceipt` (Store In) rejects without them, so an admin "skip photos" button alone would have
    been refused by the server; the jobsite delivery path is the opposite, its photo rule exists only in
    `ReceiptForm.tsx` and `recordDirectDelivery` checks nothing. The admin override
    (`feat/receipt-photo-admin-bypass`) therefore enforces the role and reason on the server for both
    (`services/gateway/src/lib/receiptPhotoBypass.ts`: `system_admin` only, not `company_admin`; reason required;
    max 500 chars) and records every use in `po_approval_log` (action `receipt_photos_bypassed`, shown on the PO
    Log tab) and `audit_log`. `confirmReceipt` logs only what was actually skipped (nothing if both photos were
    present); for a jobsite delivery the server can only record that an admin declared it. How to spot a
    half-done override: grep where the rule is enforced (server mutation vs form) before adding a way around it,
    and make the escape hatch role-checked where the rule is enforced. Web control:
    `components/procurement/AdminPhotoBypass.tsx`, shown only to `system_admin` and only while a photo is
    missing. Tests: `services/gateway/tests/receipt-photo-bypass.test.ts` (real Postgres),
    `pages/inventory/store-in/__tests__/StoreInDetail.test.tsx`, `pages/procurement/receipts/__tests__/ReceiptForm.test.tsx`.
    Note the hidden-input `Checkbox` is invisible to `getByRole('checkbox')`; use `getByLabelText`.

33. **A deny-list of "post" statuses silently auto-approves every status added after it was written.** The gate
    deciding whether a PO edit request needs an admin (`POST_APPROVAL_PO_STATUSES`) listed the post-approval
    statuses and let everything else auto-apply. It dates from Aug 2026; the requisition-split child POs (Sept:
    `bought`, `finance_review`, `payment_pending`, `closed`) were never added, so an edit to a child PO in Finance
    review, including quantities and prices, was applied by the requester with no review: the row reads
    "approved", reviewed by the requester, "Auto-applied — PO not yet approved" (NY-PO-2026-0042, qty 1 to 2). 12
    edits on 10 POs between 6 and 21 Oct, among them `unit_price` 0.75 to 750, 300000 to 30000, USD to IQD and
    `qty_ordered` 4.7 to 40.7. Same family as #29 (a status list that drifted) but with the opposite, unsafe default.
    How to spot it: an approval gate written as a list of statuses that REQUIRE review, so a new status passes by
    omission; grep `po_edit_requests` for `reviewed_by = requested_by` with review_notes "Auto-applied", and
    `po_approval_log` `edit_applied` rows whose `from_status` is a post-approval status. Fix: invert it to an
    allow-list of the pre-approval statuses that may auto-apply (`AUTO_APPLY_PO_STATUSES`,
    `services/gateway/src/lib/poEditApproval.ts`), so an unknown or future status needs approval by default; the
    test reads every status from the `purchase_orders_status_check` constraint and fails until a new one is
    classified (`services/gateway/tests/po-edit-request-approval-gate.test.ts`, real Postgres). The requisition
    equivalent (`POST_APPROVAL_REQUISITION_STATUSES`) is complete today but is still a deny-list.

34. **A list resolver that hard-codes `[]` for a child collection makes the screen look "not working" while the data
    saves fine.** The project's Contract Management tab reads the `projectContracts` list query, whose resolver
    returned `milestones: []` and `invoices: []` without ever querying the tables (since the initial commit). Adding
    a milestone worked (row in `project_milestones`, refetch ran) but the tab said "No milestones defined" and its
    Invoices box was always empty; the Edit / Mark reached / Delete actions could never be used. Production held 2
    milestones and 5 invoices it could not display. The standalone contract page worked because it uses the
    single-contract query (`projectContract`), which does load them. How to spot it: "I saved it and it isn't
    there" where the row IS in the table; grep the resolvers for `: [],` literals on a field the page renders, and
    compare the list resolver with the detail resolver for the same type. Related: the mutation responses
    (`createProjectContract`, `updateProjectContract`, ...) also return `milestones: []`; they are not rendered, but
    Apollo merges the response into the cached contract by id, so any new screen reading those fields right after a
    mutation would flash empty. Fix: the list loads milestones and invoices for every returned contract in two
    `= ANY($1)` queries (not one per contract), and both resolvers map rows through one shared helper
    (`services/gateway/src/lib/contractRows.ts`) so they cannot drift (regression test
    `services/gateway/tests/project-contracts-list.test.ts`, including a list-versus-detail parity check). Same family
    as #24, #29 and #30 (two code paths for one thing).

35. **A test that polls for "the first row" of a multi-row, fire-and-forget write passes on a small database and fails
    on a big one.** `requisition-approval-notification-prefs.test.ts` waited until `service_outbox` held at least one
    row for the requisition, then asserted the opted-in admin was in it. The notifier
    (`notifyDeptHeadsAndAdminsForRequisitionGW`) is `void`-fired and inserts one row per recipient, one `await`ed
    INSERT after another, and its admin query is every active `system_admin` in the whole database. With a few admins
    the loop finishes inside the poll's first 100 ms sleep, so the test passed locally every time; on CI's freshly
    seeded database, with many more, the second poll caught the loop half-written (`expected [ Array(1) ] to include
    '<uuid>'`) and failed on 3 of 4 dev runs, then went green on a re-run, which is why it looked flaky. Reproduced
    locally by inserting 80 extra active system_admins (fails 2 of 3), and confirmed fixed by the same padding
    (passes 5 of 5). How to spot it: a failure whose message shows a list one element long where you expected a
    specific member; a poll that returns on `rows.length > 0`; a test that only fails where the shared DB holds more
    fixture users. Fix: poll until the row count stops changing between two polls, not until the first row appears.
    Left alone on purpose: that admin query has no `company_id` filter, so a requisition notifies the system_admins
    of every company; whether that is intended for platform admins is a product decision, not a test fix.

36. **A history record that stores only the ids of rows it then deletes can never say which row it was.** A PO edit
    request kept `changes.lines.removed` as bare line ids and its line edits with no line name. While the request is
    pending the line still exists, but approving a removal deletes the `po_lines` row, so the Edit Request History could
    only ever say "1 line removed" or "line qty ordered 1.0000 → 540", with no way to tell which line (21 of the 24
    removals already on production are unrecoverable). The reader code and the payload type already supported names
    (`description` on edits, objects on removals) but nothing wrote them, so it looked like a display problem. How to
    spot it: an audit/history entry that shows counts or ids, for rows whose action deletes or rewrites the thing it
    points at; query the stored JSON for how many entries are a bare string (`jsonb_typeof(e) = 'string'`). Fix: write
    the name, quantity and price into the payload at submission, while the row exists
    (`services/gateway/src/lib/poEditChanges.ts`), and make the reader handle every generation of payload that is already
    stored (`apps/web/src/lib/poEditChanges.ts`); old rows whose line is gone stay unnamed and the card says so.
    Related: an "auto-applied" request was recognised only by its English review note; the note is now one constant
    shared by the INSERT and the `auto_applied` flag the API returns, so the page never matches on message text (#25f).
    The requisition side had a worse case of the same payload-shape mismatch: its form sends a removed line as an
    object (`{ id, description, qty, ... }`), and the post-approval guard in `submitPOEditRequest` put those objects
    straight into a `pl.id = ANY($1)` uuid query, so removing a line from an already-approved requisition failed at
    submit with `invalid input syntax for type uuid: "{"id":...}"` and never reached the review queue. Fixed with
    `removedLineId`. When a payload field is typed as a union (`string | object`), grep every consumer of it, not just
    the function that applies it.
    Regression tests: `services/gateway/tests/po-edit-request-details.test.ts` and
    `requisition-edit-request-details.test.ts` (real Postgres), `apps/web/src/lib/__tests__/poEditChanges.test.ts`,
    `components/procurement/__tests__/EditRequestCard.test.tsx`. Both the PO and the requisition page render the one
    `EditRequestCard`.
    The card also shows what a request does to the totals, and that number is never re-computed (see #6 for what
    happens when it is): a pending request is dry-run by really applying it with `applyPOEditChanges` /
    `applyRequisitionEditChanges` inside a transaction that is always rolled back, reading every line's stored
    `total_price` before and after (`dryRunEditImpact`, `lib/poEditImpact.ts`); a reviewed request keeps the same
    before/after snapshot taken around the real apply (`changes.impact`). To preview "what would this do" without a
    second copy of the arithmetic, run the real code and roll back; it also returns the real error when approving would
    fail (no stock source, no exchange rate, a line already bought against). The apply functions must touch the database
    only through their own client for this to be safe: check that before reusing the trick on another action. A first
    version of this card copied the Cost Change Approvals panel (source / if approved / if rejected) onto edit requests
    with generic sentences that said nothing about the request being reviewed; ask what the reviewer has to decide, not
    what a neighbouring screen shows.

37. **`eslint --fix` on a legacy file reformats the whole file.** Most of `apps/web` was never run through prettier
    (`PurchaseOrderDetail.tsx` alone reports ~5,000 prettier findings), and ESLint runs prettier as a rule, so
    `eslint --fix` on a file you only meant to touch in one place rewrote ~10,000 lines (and once reformatted an
    unrelated query in `graphql/inventory.ts`). Use `--fix` only on files you created. For an existing file, lint
    without `--fix` and look only at findings inside your own changed line ranges (`git diff -U0` hunks), then fix those
    by hand. On this Windows checkout (`core.autocrlf=true`) also pass
    `--rule '{"prettier/prettier":["error",{"endOfLine":"auto"}]}'`, otherwise every line reports `Delete ␍`.
    Check `git diff --stat` after any auto-fixer: a one-line change that shows thousands of lines is the tell.

38. **Making a column nullable without checking the GraphQL type that exposes it.** Migration 308 dropped NOT
    NULL on `purchase_orders.subtotal`/`total_amount` and `recalcPOTotalsGW` began writing NULL for a
    mixed-currency or line-less PO, but `PurchaseOrder.total_amount` stayed `String!`. GraphQL does not return a
    NULL for a non-null field: it nulls the nearest nullable parent. `purchaseOrder(id)` and `myPOQueue` came
    back `null`, a row of `purchaseOrders` became `null` (the web filters null rows, so the PO silently
    vanished from the list), and `requisitionChildPurchaseOrders` is `[PurchaseOrder!]!`, so ONE mixed child PO
    nulled the requisition's whole Child POs list. It shipped because every gateway test calls the resolver
    functions directly (`resolvers.Query.purchaseOrder(...)`), which never runs the schema's nullability
    checks, and the web tests mock Apollo. How to spot it: a migration that drops NOT NULL, or any new code path
    that can write NULL; then grep `schema.ts` for the field and every `!` on it, and `[Type!]!` lists that
    return it. Fix: make the field nullable and read the per-currency figure instead (`lib/poTotals.ts` on the
    web is the one place that decides what to show). Test it at the GraphQL layer:
    `services/gateway/tests/po-mixed-currency-graphql.test.ts` runs the real `ApolloServer({ typeDefs,
    resolvers }).executeOperation` against real Postgres with the selection sets the web sends. Do not build the
    schema yourself with `graphql()` + `makeExecutableSchema` in a vitest file: it loads two copies of `graphql`
    (`Cannot use GraphQLSchema ... from another module or realm`). Related to #14 (tests that skip the layer the
    bug lives in) and #34 (a screen that looks empty while the data is fine).

39. **A rollback note that says "backward-compatible" without checking what the migration removes.** The
    release notes called a code-only rollback safe because "nothing the old code read was removed or renamed".
    Migration 309 drops `fx_to_budget()`, which the previous release's `project` query calls, so rolling the code
    back would have broken every project page; it also said the deploy pipeline had a backup step, and
    `deploy.yml` has none. How to spot it: for every `DROP` / `RENAME` / `SET NOT NULL` / view rewrite in a
    migration, `git grep` the PREVIOUS release's commit for the name (`git grep -n fx_to_budget <prev-sha>`).
    If anything uses it, the rollback section must say "no code-only rollback past migration N" and name the
    only real options (fix forward, or restore a dump taken before the migration). Confirm a backup claim in the
    workflow file, not in the notes.

40. **A shared table that forces every cell onto one line hides columns on any screen narrower than its longest
    value.** `components/ui/Table.tsx` set `white-space: nowrap` on every body cell, so a single long text value sets
    the width of the whole table; anything wider than the card sits behind a horizontal scrollbar at the bottom of the
    list (the component's own `maxHeight` comment describes it). On the requisition Lines tab the item names are
    supplier catalogue descriptions of 100+ characters ("110-003-019 UNIVERSAL SLIM WC SEAT MODEL 2 - ROUND FORM
    (DUROPLAST, SOFT-CLOSING, DETACHABLE METAL HINGE, TOP FIXING)"), and at pending approval the table has eight
    columns (flag, #, item, qty, from stock, store / market / verified price), so on a normal laptop the user saw
    flag, #, item and a clipped "Qty" and none of the prices. It looked fine for the developer on a wide monitor, and
    an earlier workaround (the flag checkbox moved to the leftmost column "because only leading columns are guaranteed
    visible") treated the symptom. How to spot it: "the columns don't fit on his screen but they do on mine"; open the
    page in a narrow window (or at 125 to 150 % zoom) with a realistic, long value in the free-text column. Fix: an
    opt-in column option, `wrap: true` (with a `minWidth`), so only the free-text column wraps and every numeric
    column stays on one line; nothing changes for the ~90 other tables. `overflow-wrap: anywhere` is deliberate (it
    lets a long part number break too), which is why `minWidth` is needed: without it the column could collapse to a
    sliver. Other tables with long free text (PO lines, Items Bought, stock moves) have the same cells and have not
    been checked. Tests: `components/ui/__tests__/Table.test.tsx` and `RequisitionDetail.test.tsx`; these prove the
    style, not the pixels (jsdom has no layout), so check a narrow window by eye after changing a table.
