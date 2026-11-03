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
    Why a wide window can still be too narrow: `useBreakpoint` (phone / tablet / desktop) reads `window.innerWidth`,
    but the Lines table lives in the right-hand panel next to the Next Step panel, so on a 1440px window it can be
    about 700px wide while the hook says "desktop". Anything that must adapt to the room a table actually has needs the
    width of its own container (a `ResizeObserver`, as `ScrollFadeRow` does), not the window's.
    The Lines table now lets the person choose its columns and row spacing (`useTableView`, `ColumnsMenu`,
    `DensityToggle`). The choice is kept in `localStorage` per user and per table (`fnc_table_view_v1_<user>_<table>`),
    and only the columns the person actually switched are stored, as overrides of each column's default; storing the full
    list would freeze stage-dependent columns (store price) and hide any column added later.

41. **Two screens on one page can define "received" differently.** On a PO at Goods received, the Next Step coverage
    list counts a line as fulfilled when `qty_received + qty_from_stock >= qty`
    (`PurchaseOrderDetail.tsx`, `const fulfilled = Math.min(ord, rcv + fromStk)`), while the Lines table's Received
    column counts only `qty_received >= qty`. A line covered entirely from stock therefore reads 100 % in the panel and
    "0/n received" in the table. Found while designing a combined "9 of 11 lines fully received" summary, which needs one
    answer; NOT fixed yet (changing it changes what users see, so check real data first: lines with
    `qty_from_stock > 0` on POs that are past receiving). Same family as #23 and #34 (two code paths for one thing): when
    a number is shown in two places, put the rule in one function both call, with a test that feeds it a
    from-stock line.

42. **A popover drawn inside a `Card` is clipped by the card.** `components/ui/Card.tsx` sets `overflow: hidden`
    (line 56), so anything absolutely positioned inside it that sticks out past the card's own edge is cut off. The
    Lines table's "Columns" menu showed only its first five tick boxes on a one-line purchase order (the card was only
    as tall as the table) and looked like a broken list; on a long order it looked fine, so it was missed. How to spot
    it: a menu, tooltip or date picker that is complete on a big screen or a long page and cut at a straight edge on a
    small one; look for `position: 'absolute'` inside a `Card`. Fix: draw it with `createPortal(…, document.body)` and
    `position: 'fixed'`, placed from the trigger's `getBoundingClientRect()` (right edge in English, left edge in
    Arabic, never off the window, flipped upward when there is no room below, `max-height` with its own scroll,
    repositioned on window resize and ancestor scroll). A portal leaves the natural Tab order, so move focus into it
    on open and back to the trigger on Escape (React still sends the portal's key events to the component that owns
    it). `SearchableSelect` and `Modal` already portal; `components/ui/Dropdown.tsx` is absolutely positioned with no
    portal and has not been checked for the same clipping. Tests: `ColumnsMenu.test.tsx` ("where the list appears").
    The same screen also had the Next Step panel and the Lines table both set to `flex: 1 1 460px`, so each took half
    of a wide screen; the lines are now `40 1 460px` against Next Step's `4 1 460px` (Next Step about 535px on a wide
    screen; they still wrap and stack at the same window width). Equal `flex-grow` on two columns means "split the room in half", which is rarely intended
    when one of them holds a table.

43. **"The store price" is two different figures, and a field added to a shared line type has two builders.**
    A request for "the price of the item saved in inventory, not the store price" had a trap in the word: a line's
    `store_price` (`po_lines.store_price`) is what the store keeper typed on THAT line while pricing it, whereas the
    inventory figure is the catalog product's own Cost (`products.standard_cost` + `cost_currency`), the one Cost
    Change Approvals manages. Showing `store_price` would have answered a different question. The new
    `inventory_cost` / `inventory_cost_currency` come from the `products` join in BOTH line builders (the PO lines SQL
    and the requisition lines SQL), because the GraphQL type `POLine` serves both pages; adding it to one builder
    leaves the other page's column silently empty (same family as #23 and #34). Three data rules that the cell has to
    respect: `standard_cost = 0` means "never recorded" (the SQL uses `NULLIF(p.standard_cost, 0)`, so it arrives as
    null and shows a dash, never "0 USD"); a cost can be saved with no `cost_currency` (about 2,000 Nishtimani
    Factory products from legacy imports), which is shown with a "currency not set" tag and never given a guessed
    currency; and a product cost is often in a different currency than the line (about a third of recent lines), so it
    is never converted, compared or added into a total (no cross-currency conversion in this system). How to spot the
    mistake: a "reference" column that equals a number already on the line, or a column that is filled on one page and
    empty on the other. Tests: `services/gateway/tests/po-lines-inventory-cost.test.ts` (real Postgres, through
    `ApolloServer.executeOperation`, both `purchaseOrder` and `requisition`, including another company's user and a
    cost that changes after the line was made), `components/procurement/__tests__/InventoryCost.test.tsx`, and the
    "inventory cost" blocks in `poLinesView.test.tsx` and `RequisitionDetail.test.tsx`.

44. **A delivery-destination check was allowed to switch off the Store Out for stock-covered lines, and a wrong first
    fix then hid the gap.** The business rule (stated by the user, not derived from the code): the delivery
    destination only decides what happens to PURCHASED goods (to inventory: a Store In; to the jobsite: straight to the
    jobsite, no Store In). Anything covered from inventory ALWAYS gets a draft Store Out that reserves its quantity until
    it is confirmed; confirming deducts it and releases the reservation. The destination is chosen when the requisition
    is created, long before approval, so it can never be a reason to skip that Store Out. The code did the opposite:
    since August (`e40d5a0`) `issueStockForRequisitionLines` and `issueStockForPOLines` return early for a project
    document delivered to inventory ("isn't consuming anything yet"), so those stock lines got no Store Out. Found live:
    REQ-2026-0075 (9 stock lines, 72 units; STEEL-018: 18 units reserved, available 0, nothing to confirm). Scale on
    production: 7 project requisitions delivered to inventory, 40 stock lines, about 1,885 units with no Store Out line
    and 0 issued (4 open, 253 units, still reserved; the other 3 are pre-G1 `REQ-MIG-*` imports, see below); jobsite
    requisitions work (28 of 29). Because project cost is posted when a Store Out is confirmed, those projects were never charged for that
    stock, and a Store Out made by hand with no `po_line_id` can draw only the UNRESERVED part, so nobody could issue the
    reserved units manually either. Second gap, any destination: a buyer can "resolve a line from stock" at Items Bought
    (`resolveRequisitionLineFromStock`); it reserves the stock but creates no Store Out, because Store Outs are only built
    once, at approval (REQ-2026-0010, 0.1 unit, stuck in Sourcing since 4 Oct).
    **A wrong first fix (commit `1cdfbb6`, live on production for a few hours, then undone):** I read the skip as the
    intended rule and made the COMPLETION check ignore stock lines for that kind and release the reservation when the
    requisition completed. That would have closed REQ-2026-0075 with 72 units never issued and never charged to the
    project, and, together with the real fix (a draft Store Out per stock line), it cannot coexist: the reservation would
    be released first, so confirming the draft later fails with "Reservation mismatch". Lesson: when code and a business
    rule disagree, ask which one is right BEFORE building on either; "the code says X deliberately" (a comment, a commit
    message) is evidence of what was decided once, not of what is wanted now. A completion rule must keep waiting for
    the thing that releases the reservation.
    Kept from that commit: `materialIssues(requisitionId)` also returns Store Outs made against the requisition's child
    POs (scoped to the caller's company), and the requisition's Store Outs card shows a PO Number column.
    The real fix: the destination skip and `projectStockStaysInInventory` are gone; one function,
    `coverRequisitionStockLines`, gives every stock-covered line its draft Store Out for the part no non-cancelled Store
    Out line covers yet, so it is safe to run again. Approval, `resolveRequisitionLineFromStock` and the backfill all
    call it (one function for one rule, so they cannot drift). The PO-side `issueStockForPOLines` lost the same skip
    (no standalone project PO delivered to inventory had stock lines, so it changes no existing data). The backfill for
    requisitions approved before the fix is `services/gateway/src/scripts/backfill-stock-store-outs.ts`, compiled by the
    gateway build and run on the VPS (`tsx` is NOT installed there, only `tsc`) from `services/gateway` after sourcing
    `/opt/fnc-erp/.env`: `node dist/scripts/backfill-stock-store-outs.js --company "<company name>" --requisitions REQ-A,REQ-B`
    (`--company` is required because requisition numbers repeat across companies: REQ-2026-0047 exists in two) is a dry run (reads
    only, takes no Store Out number, refuses a requisition whose reservation is smaller than its drafts would need,
    because confirming would then fail with "Reservation mismatch"); adding `--apply --actor-email <admin>` writes one
    transaction per requisition, records the drafts and an `audit_log` row under that administrator, and running it
    twice creates nothing the second time. Back the database up first (`scripts/backup-db.sh`). It creates DRAFTS only:
    nothing moves, nothing is charged and no reservation changes until a person confirms each draft. Deliberately NOT
    run for the three completed `REQ-MIG-*` requisitions (20 stock lines, 1,632 units): they are pre-G1 historical POs
    that migration 258 moved onto synthetic requisitions, 14 of the 20 lines have no source location, only 52 of the
    1,632 units are available today, and their project already has its cost booked through other entries
    (`stock_issue`, `po_direct_delivery`), so a Store Out would fail or double-deduct and double-charge; treat them as
    history. How to spot this class: a requisition in `sourcing` whose child POs are all
    finished; compare "what does approval create for X" with "what does completion wait for for X", and look for every
    other place `qty_from_stock` is set after approval. Tests:
    `services/gateway/tests/requisition-stock-lines-completion.test.ts` (real Postgres: both destinations, fully and
    partly from stock, remainder marked short, resolve from stock, reuse of the open draft, project cost charged on
    confirm, Store Outs by child PO), `backfill-stock-store-outs.test.ts` (dry run writes nothing, refusals, apply,
    idempotence, audit, the created draft can be confirmed) and the Store Outs block in `RequisitionDetail.test.tsx`.
    Related to #23, #24 and #34.

45. **A line removal that several tables silently forbid, and a raw foreign key error as the only explanation.** Approving
    an edit request that removes a PO line ran `DELETE FROM po_lines` straight away. Twelve foreign keys point at
    `po_lines` and seven have NO delete action (`po_receipt_lines`, `stock_moves`, `vendor_invoice_lines`,
    `po_return_items`, `advance_settlement_lines`, `project_material_return_lines` and `po_lines.origin_line_id`; four
    cascade and `project_material_issue_lines` sets null), so a doomed removal
    reached the review queue and only failed when an admin clicked Approve, with
    `update or delete on table "po_lines" violates foreign key constraint "po_receipt_lines_po_line_id_fkey"` (the Edit
    Request card prints it as "Approving this would fail right now"). The requisition path had a guard for bought or
    forked lines; the PO path had none. Found live on PO-2026-0021: a 19-unit pipe line that was never received (the
    line itself said 0 received) was blocked by a row on a CANCELLED receipt (RCPT-1788941844304, 37 lines, no stock
    moves) that had nothing to do with receiving. Fix (`lineRemovalBlocks`, `assertLinesRemovable`,
    `clearCancelledReceiptLines` in `resolvers.ts`): name the real blockers in plain words at submission AND at approval,
    for POs and requisitions; receipts count by STATUS (confirmed and draft block; cancelled and reversed do not), and
    only a stock move still in effect (`superseded_at IS NULL`) blocks; see the follow-up below for what happens to the
    history of a cancelled or reversed receipt. The check is scoped to
    the PO's or requisition's own lines, so naming another document's line reveals nothing.
    **My own mistake worth keeping:** I first told the user both pending removals were "goods received" because the
    query counted any `po_receipt_lines` row and the PO status was `goods_received`. A PO's status says nothing about one
    line, and a receipt row says nothing without the receipt's status. When asked "was this received?", read the line's
    own `qty_received` AND the receipt's `status`. How to spot this class: before deleting from a table, list every FK that
    points at it (`pg_constraint`, `confdeltype`) and check each one; a delete behind an approval screen needs the same
    check at submission, or the problem is only found by the approver.
    Tests: `services/gateway/tests/po-line-removal-blockers.test.ts` (real Postgres: cancelled receipt cleared with
    the line and only that line, other receipts untouched, confirmed / draft / reversed / stock-moved / split-from /
    several reasons refused with the reason, the approval-time check for a request raised before the goods arrived and
    the plain text in the preview, no probing of another PO's lines, an untouched line still removed).
    **Follow-up, same day it shipped (NF-PO-2026-0066): the advice in the message led into a second block.** The message
    for a confirmed receipt said "reverse that receipt first". The user did, with the real `reverseReceipt`, and the
    removal was refused again: a reversed receipt keeps the receipt and its stock moves as history (both moves
    superseded, netting to zero) and the first version treated that history as a blocker. A refusal that tells the user
    how to fix it must be tested along that exact path, with the real mutations (receive, confirm, reverse, then
    remove), not with rows inserted by hand; the hand-built "reversed" fixture is what let the dead end through. Rule
    now: a reversed or cancelled receipt does not block, and a stock move blocks only while it is in effect. When such a
    line is removed its history is DETACHED, never deleted (`detachDeadLineHistory`): the line's rows leave the
    receipt, and the stock moves that still point at the line or its receipt lines keep every amount, quantity,
    location and date and only lose the two link columns (`po_line_id`, `po_receipt_line_id`), which is allowed on
    superseded moves only (the ledger is append-only; `stock_moves` has an insert trigger for balances and no update
    guard). The old links are written to the edit request (`changes.detached_history.stock_moves`) so they stay
    recoverable. The preview (`dryRunEditImpact`) runs the same code inside its rolled-back transaction, which is why
    the detach must go through the apply function's own `client` and never the shared `pool`. A mutation check caught a
    gap in the first set of tests: both live-move tests linked the move through the line AND the receipt line, so
    either half of the check alone passed; each path now has its own test (a Store Out leaves a move linked to the line
    only).

46. **A screen built around the old parent document silently hides everything made under the new one.** Material
    Returns were scoped to a Purchase Order (migration 272): `returnableMaterialIssueLines` filtered `pmi.po_id IS NOT
    NULL` and `createMaterialReturn` took a required `poId`, with a comment saying a Store Out with no PO "can never be
    completed through this flow". After the requisition split (G1) the Store Out for a stock-covered line is made
    against the REQUISITION (`project_material_issues.requisition_id`, no `po_id`), so none of them could be returned:
    the dialog said "nothing outstanding on any purchase order" and nothing errored (Nishtimani Yakam, PLMB-727,
    SO-00004 / 00008 / 00014, 12 units issued from the central warehouse; 50 of 289 issued Store Outs on production
    belong to a requisition). The filter was deliberate and commented, which is why it survived: a comment records what
    was decided once, not what is wanted now (same lesson as #44). How to spot it: a feature scoped by `po_id` that
    "finds nothing" for recent documents; grep the resolvers for `po_id IS NOT NULL` and required `poId` inputs and ask,
    for each, what the requisition equivalent is. Store Out numbers repeat across companies (SO-00004 exists in both
    Nishtimani Factory and Nishtimani Yakam), so identify a Store Out by company and project, never by number alone.
    Fix: migration 310 adds `project_material_returns.requisition_id` (CHECK: never both parents); a return hangs off
    exactly one of PO / requisition; the project cost offset reverses the Store Out's OWN `project_id` (what
    `issueMaterialIssue` charged), not the parent's; the list and the mutation response now share one SELECT and one row
    mapper (`MATERIAL_RETURN_SELECT`, `mapMaterialReturnRow`) so they cannot drift (#23, #34). The cross-company return
    path (`postCrossCompanyMaterialReturnMove`: stock back into the central warehouse, a posted transfer and a PENDING
    reversing bill for Finance) already existed and had no test; it now has one. Still not returnable, on purpose: the
    156 manual Store Outs that have neither a PO nor a requisition (no parent to hang a return on; separate decision).
    Same session, same screen: cross-company stock-move notes carried the raw company id ("Store Out SO-00014 to company
    00000000-0000-0000-0000-000000000001"); they now use `companyNameForNote`. Writing that fix also showed
    `createIntercoStockTransfer`'s receiving-side note said "from company <caller>" even when the source company was a
    different one (central warehouse or system_admin initiating); it now names the real source. Existing rows keep the
    old text (stock moves are an append-only ledger; not rewritten). Tests:
    `services/gateway/tests/material-return-requisition.test.ts` (real Postgres: same company and cross-company, over-
    return, two-step return, another company's user, wrong-requisition line, PO-delivery line, notes) and the
    "requisition Store Out" tests in `apps/web/src/pages/inventory/__tests__/inventory.test.tsx`; the three fixes that
    matter most (the PO-or-requisition filter, the company name in the notes, the web submit by requisition) were each
    checked by undoing them and watching the matching tests fail.
47. **An upload check that compares the file's extension with the browser's content type refuses real files when the
    list of accepted types is the textbook one, not the one browsers send.** Uploading a bid archive to the Bidding
    stage failed with `INVALID_FILE: File extension .rar does not match content type application/x-compressed`.
    `validateFile` (`packages/storage/src/validate.ts`) cross-checks the extension against `EXTENSION_MIME_MAP` as a
    spoofing defence, and it runs even for the blocklist-only `attachment` category. The map listed only the
    registered names (`application/vnd.rar`, `application/x-rar-compressed`), but a Windows browser reports
    `application/x-compressed` for `.zip`, `.rar` and `.7z` once WinRAR or 7-Zip has registered the extension, so the
    same file passed or failed depending on which tools were installed on the user's PC. The error showed `.rar` while
    the user said "zip file": read the extension in the message before assuming what was uploaded. Nothing caught it
    because `validate.test.ts` had no archive case at all. Fix: `application/x-compressed` added to the three archive
    entries, with tests for each, for the still-refused cases (`fake.pdf` sent as an archive type, `.rar` sent as
    `image/jpeg`, the `contract` category) and a check that undoing the fix fails exactly the three new tests. (Superseded
    by #50: a file whose type the browser could not determine, sent as `application/octet-stream`, is no longer a mismatch.) How to spot it: "this file won't upload but a colleague's will"; the message shows the
    type the browser sent, so add THAT type to the map rather than loosening the check. Related to #30 (a web or
    server list that drifted from what actually arrives). Rebuild `packages/storage` and restart the gateway for it to
    take effect (#9).
48. **A write action guarded only by "logged in" while its permission key sits unused, and a re-assignment that
    silently re-prices stock.** `createIntercoStockTransfer` (the Inter-company > Stock Transfers form) moves stock
    out of one company into another, yet it checked only that the caller was authenticated. The registry already
    had `interco.stock_transfers.edit` (`packages/permissions/src/registry.ts`) but nothing read it: the route and the New Transfer button
    asked only for `view`, so any user could send their own company's stock to ANY company by calling the mutation
    directly. Zero manual transfers had ever been made on production (only 25 automatic ones from Store Outs), so
    nothing had exposed it. How to spot it: for every `*.edit` key in the permission registry, grep for a consumer
    (`requirePermGW(... 'key'`, `withPerm('key'`, `can('key'`); a key with none is a guard that was never wired.
    Fix: the mutation now needs that permission (admins pass) AND the right to act in the destination company
    (`callerHasCompanyAccessGW`: a system admin, or an active role there; a company admin of the source alone is
    not enough), the route and the button follow the same key. Still open on that mutation: the destination
    location is not checked to belong to the destination company, and it checks on-hand but not on-hand minus
    reserved. Tests: `services/gateway/tests/interco-stock-transfer-permission.test.ts` (real Postgres: no
    permission, view-only, no destination access, company admin without a destination role all refused with the
    stock untouched; editor with both roles and a system admin succeed) and the New Transfer button block in
    `apps/web/src/pages/interco/__tests__/interco.test.tsx`.
    The same work produced the one-off `services/gateway/src/scripts/consolidate-stock-into-central.ts`: the group
    now keeps ONE inventory, in Nishtimani Factory (`docs/claude/domain.md`), so what other companies still hold is
    folded into it with two plain stock-ledger entries (source type `company_consolidation`), no bill, no price,
    no journal. Three traps it had to respect. (1) Items are never matched across companies by SKU: all 77 SKUs
    that Yakam and Factory share are DIFFERENT items (KIT-004 is Kleenex in one, chicken in the other), so an
    item the destination does not own refuses the run. (2) Stock is valued at its LAST cost, and a move's cost
    replaces the location's cost (migration 283's trigger): moving 4 units at 20 into a location holding 6 at 10
    makes all 10 read 20. A re-assignment must not re-price what is already there, so the incoming entry takes the
    destination's own cost and currency when it already holds the item (my first test assumed a weighted average
    and failed, which is how it showed). (3) `logAudit` swallows its own errors, and a failed statement inside a
    transaction turns COMMIT into a silent ROLLBACK, so the script re-reads the committed rows before reporting
    success. Run as a dry run first; `--apply` is all-or-nothing per company, unless `--skip-blocked` is given
    (move what can move, report the rest as LEFT BEHIND, run again later). `--create-missing-items` copies an item the
    destination does not own into its catalog instead of refusing it: always a NEW item (a copy keeps the source SKU only
    if the destination has none like it, otherwise it takes the next number of the destination's own store sequence,
    the same numbering as the Add Product form; the dry run previews the number without using it up). Found on
    production: all three Yakam-owned items with stock (FACT-001, GEN-004, GEN-023) had a DIFFERENT Factory item on the
    same SKU, so none could keep its SKU. A refused `--apply` once printed `APPLIED` in its closing line (the label
    keyed on the flag, not the status); read the status and the database, not that word. Tests:
    `services/gateway/tests/consolidate-stock-into-central.test.ts` (31; the safeguards were each mutation-checked, except
    the final left-behind-count post-check, which correct operation never trips).

49. **Mutation-checking by swapping in `git show HEAD:file` can corrupt the file on Windows.** The check "put the
    original back, run the tests, restore the fix" is right, but `git show HEAD:file | Set-Content -NoNewline`
    joins the array of output lines with nothing between them, so a 40,000-line file became one line (and the
    tests failed to PARSE, which looks like a pass for the mutation and proves nothing). The fix was restored from
    a saved copy and checked byte-for-byte (`cmp`, and `git diff --stat` showing only the intended lines).
    Do it this way instead: save a copy of the fixed file first, write the original with
    `cmd /c "git show HEAD:path > file"` (bytes preserved) or edit a copy with `String.Replace`, run the tests
    inside `try { ... } finally { restore the copy }`, and read the failing test NAMES, not just "failed".
50. **"Allow all file types" is four separate restrictions, and relaxing one leaves the others.** The Bidding
    Stage packages, Attachments and Preliminary Engineering tabs each limited what could be uploaded in a different
    place. (1) The browser's file dialog: `accept=".zip,.rar,.7z"` on the bid packages, an `ACCEPT` list on Attachments
    (`.xlsx,.pdf,.doc…`), and `input.accept = '.pdf,.dwg,…'` on Preliminary Engineering (Client Documents already used
    `*/*`). (2) The type the page sends: Attachments and the two Bidding uploads sent the raw `file.type`, which is `''`
    for any type the PC has no program registered for (a `.dwg` or `.rvt` without the CAD software), and the gateway
    rejects an empty `mimeType` (`z.string().min(1)`), while a request with an empty `Content-Type` is not read as a
    body at all; the other pickers already sent `file.type || 'application/octet-stream'`. (3) The server's
    extension-versus-type cross-check (`validateFile`), which refused a known extension (`.pdf`, `.docx`, `.zip`…)
    whose declared type was `application/octet-stream`, although "unknown" cannot be a spoof of another type. (4) The
    server's deliberate blocklist (`.exe .bat .cmd .sh .ps1 .js .php .py .rb .pl .vbs .jar .com .scr`, and
    `.html .htm .xhtml .shtml .svg`, the last group because a previewed upload would run script); that one was NOT
    relaxed, see the decision recorded with the change. How to spot it: "it only fails for some files"; in the Network
    tab a 400 `VALIDATION_ERROR` means an empty type, `INVALID_FILE` means the server check. Fix: one helper,
    `uploadMimeType(file)` (`apps/web/src/lib/uploadMimeType.ts`), used by every upload in those tabs; no `accept`
    filter on them; `validateFile` skips the cross-check for `''` / `application/octet-stream` (categories with a fixed
    allowlist, e.g. `contract`, still refuse it). Other `/files/upload-url` callers still send the raw `file.type`
    (`ExecUploadButton`, the machinery photo, `FileAttachments`, the HR/PO/receipt forms): switch them to the helper when
    they are touched. Tests: `packages/storage/tests/validate.test.ts` (unknown type accepted for nine real cases,
    blocked extensions still blocked, spoof check intact, fixed-allowlist categories unaffected; undoing the rule fails
    7), `apps/web/src/lib/__tests__/uploadMimeType.test.ts`. Follow-up, same day (`some ZIP types still not accepted`): the three archive
    extensions now share ONE family of type names (`ARCHIVE_MIME_TYPES`: zip, x-zip-compressed, zip-compressed, x-compressed,
    x-rar, vnd.rar, x-7z-compressed, gzip, tar…) because the name a PC reports depends on which program registered the
    extension and people rename one format to another; anything that is not an archive type (`image/jpeg`,
    `text/html`…) is still a mismatch, and the refusal text names the extension and the type. Production data: 140
    ZIP uploads have worked, all `application/x-zip-compressed`, the largest 49.1 MB, and the one RAR `x-compressed`. The
    real ceiling for ANY file is 50 MB: nginx `client_max_body_size 50m` (`/etc/nginx/sites-enabled/fnc-erp`) and the
    gateway upload proxy `express.raw({ limit: '50mb' })` (`routes/files.ts`) both stop a bigger body before the
    application sees it (nginx answers 413 with an HTML page), while `MAX_FILE_SIZE_BYTES` says 250 MB, so the server's
    own size message never appears first. The gateway request log records neither 400 refusals nor 413s, so a failed
    upload leaves no trace on the server: the screen has to say why. Every upload toast in the four tabs now appends the
    server's message or the 50 MB limit (`uploadFailureMessage`, `apps/web/src/lib/uploadMimeType.ts`) instead of a
    bare `Upload failed`. Related to #47 (the same validator) and #30 (a list in the
    page that drifts from the server's).

51. **`<Trans>` keys that never got any text print the raw key on screen, and a build never notices.** The Bidding
    Stage drop area showed `proj.detail.dropZipHereOr` and the Attachments tab `proj.detail.dropFileHereOr` /
    `willBeTaggedAsExcelPdf`. The i18n codemod turned JSX text with a highlighted part into
    `<Trans i18nKey=… components={[<span/>]} />` but never wrote the matching strings: `proj.detail` has no value with a
    `<0>…</0>` in it in either language. A scan of `ProjectDetail.tsx` found 26 such keys (all `<Trans>`; the plain
    `t('…')` keys were complete); the five on the upload areas are fixed, 21 remain (`isCurrentlyWorkingOnThisDocument`,
    `supersedingMarksTheCurrentAsBuilt`, `typeToUnlockTheConfirmButton`, `workPackage`, `voRef`, `ptw`, …). Same family as
    #26 (a missing key falls back to the raw key, silently) but a different cause: not the wrong namespace, no text at all.
    How to spot it: a label on screen that looks like a dotted code. Detect it with a script, not by eye: collect every
    `t('a.b.c'` and `i18nKey="a.b.c"` in the file and check each resolves in both locale files (treat a `key_*` plural
    sibling as present). Fix: add the text to BOTH files with `<0>{{value}}</0>` where the component puts its highlighted
    part, then render the real `<Trans>` in each language and assert there is no `proj.detail` in the output and the
    highlighted word sits in the `<0>` span (`apps/web/src/i18n/__tests__/uploadAreaKeys.test.tsx`; removing a key fails
    it). Run the scan for any file that a codemod touched before trusting its translations.
52. **A list built on one `entity_type` shows only what was uploaded through that screen, while the project's files
    live in twenty places.** The project's Attachments tab read `/files/attachments?entityType=project`, so it listed
    only files uploaded through itself. Every other tab keeps its files elsewhere: Client Documents in
    `project_client_documents.file_id`, Preliminary Engineering in `engineering_documents.file_id`, the bid packages,
    deliverables and technical queries as `document_attachments` rows of their own entity types (`bid_package_technical`,
    `bid_package_commercial`, `bid_deliverable`, `tq`), meetings, drawings, punch photos, transmittals, RFIs, NCRs,
    contract and invoice documents, and so on. AW-PRJ-2026-0080 had a Client Document (a WhatsApp image) and the Attachments
    tab said "0 documents". On production only 1 file in the whole system had ever been attached through that tab,
    against 198 in Client Documents and 152 bid packages. How to spot it: "it is in the other tab but not here"; compare
    the entity types in `document_attachments_entity_type_check` and every `file_id` column
    (`information_schema.columns`, name ending `file_id`) with what the screen queries. Fix: one GraphQL query,
    `projectFiles(projectId, tabs)`, over one registry (`services/gateway/src/lib/projectFiles.ts`: one entry per kind of
    file, tagged with the project tab it lives in). Rules it keeps: the project's own view guard
    (`requireProjectViewGW`); a tab's files only to a caller holding the permission that tab's own queries already
    require (`PROJECT_FILE_TAB_PERMISSION`: client_documents, engineering, bidding, meetings, contracts, handover,
    execution, attachments), so it never shows more than the tabs do; bid-pricing files (the Commercial bid package,
    supplier quotations, contract and invoice documents) are kept from a plain technical team member exactly as the
    Bidding tab hides its Commercial sub-tab (`canSeeProjectCommercialFilesGW`: an admin, the PM, a holder of
    `projects.edit`, or anyone who is not a technical member sees them). The page asks only for the tabs the viewer can
    open (`lib/projectFiles.ts`), each file shows where it came from with a link to that tab, and only a file uploaded
    through the Attachments tab (it has an attachment id) can be removed there. Deliberately NOT in the list: files that
    belong to procurement, inventory or finance documents (`purchase_order`, `po_receipt`, `po_line_purchase`,
    `po_return`, `material_issue`, `expense_claim*`, `journal_entry`, `vendor`, `employee`, ...), which stay in their own
    modules. To add a new place that takes uploads: one registry entry plus one seeded row in the test, which fails
    until every registered source returns its file. The machinery photo of a daily report is queried but not seeded
    (it needs a purchase order). Tests: `services/gateway/tests/project-files.test.ts` (real Postgres, one real file
    per source, so a wrong column fails there; per-tab permission, the Commercial rule, deleted and other-company
    files, newest first), `apps/web/src/lib/__tests__/projectFiles.test.ts`, and
    `apps/web/src/pages/projects/detail/__tests__/AttachmentsTab.test.tsx` (renders the real tab; `AttachmentsTab` is
    exported only for that). Related to #34 (a list that is empty while the data is fine) and #23 (one thing, several
    code paths). Lint trap met on the way: `@typescript-eslint/non-nullable-type-assertion-style` rewrites
    `x.closest('…') as HTMLElement` into `x.closest('…')!`, which `no-non-null-assertion` then forbids, and the `!`
    leaves the type as `Element`; use `closest<HTMLElement>('…')` and throw if it is null.
53. **A fixed-position page decoration (the stamp) over a page whose length was decided by a row count.** On the
    letterhead invoice (`apps/web/src/lib/invoiceHtml.ts`, printed from the Invoice > PDF tab) the company stamp is
    `position: fixed; bottom: 43mm`, so it repeats at the same spot on EVERY printed page (about 43 to 77 mm up from the
    bottom edge, label included). Pages were cut server-side at 6 rows (`FIRST_PAGE_ROWS`), whatever those rows measured.
    A description that wraps to four lines (supplier-style text in a 170 px column) makes page 1 taller than the space
    above the stamp, so rows 5 and 6 and the "Continued on next page" bar printed on top of it. It stayed invisible for
    years only because the stamp image had a solid background that painted over the rows; the first transparent stamp
    exposed it. In the worst case Chrome cut the table at the sheet edge and the rest landed on top of the next page's
    letterhead header (reproduced on the old code: rows 5 and 6 of the user's own invoice were not on page 1 at all).
    How to spot it: text visible through a transparent stamp or logo; a layout whose page length is a constant ("6 rows")
    rather than a measurement; anything `position: fixed` in a print stylesheet (it repeats on every sheet and takes no
    room in the flow, so nothing in the flow knows to stay away from it). Fix: the generated page carries a script that
    re-paginates from real heights, filling a page with rows until the next one would end the table below
    `297 - topPadding - 85` mm and then starting a new one, and moving the totals/payment block on if it does not fit
    either. Traps met while writing it:
    (a) *Measure with the print geometry, not the screen's.* The on-screen iframe is wider and wraps less, so it
    under-measures what the printer lays out. The script switches `html.measuring` on while it measures; that class
    applies the same rules as `@media print` (A4 width, print paddings, stamp out of the flow), and both come from ONE
    function (`printGeometryCss(scope)`) so they cannot drift. The measurement gave identical splits at a 500 px and a
    1100 px viewport.
    (b) *Convert mm to px with a probe element*, not `96 / 25.4`: the verification page injects `html { zoom }` into the
    same HTML and `getBoundingClientRect` reports zoomed pixels.
    (c) *`appendChild` moves a node, it does not copy it.* My first version re-appended rows into a tbody that still held
    the old rows and silently re-ordered them (page 1 came out empty). Empty the old tbody first.
    (d) *A flag measured for the last element has to be undone when that element moves.* The final row is measured without
    the "continued" bar; when it overflowed to a new page, the page it left kept no bar. A unit test on the page
    structure caught it; a screenshot check did not.
    (e) *Let the script wait for the web font* (`document.fonts.ready`, a 3 s timer in case the font request hangs, and
    `beforeprint`): Arial and Inter wrap differently.
    (f) *`.page2-break.page-mid` has `padding-bottom: 85mm`* and the page's own footer bar sits below the table, so a
    page filled to the limit overflows its sheet by the footer's height and Chrome prints a blank sheet after it. The
    original output has such near-blank sheets already (a sheet holding only a footer bar, seen on a 20-row invoice);
    pages made by the script are not `page-mid`. `makePage()` in the totals overflow still creates `page-mid` pages: check that if blank sheets
    show up after the last page.
    (g) *One shared stamp position was set by the worst letterhead.* The first fix kept the stamp 43 mm up and reserved
    85 mm for it everywhere, and that number exists only because Al Watanyia's footer artwork rises to 41 mm from the
    bottom edge; Yakam's starts at 24.7 mm and Factory's at 23.9 mm, so those two wasted about 18 mm a page (page 1 of a
    24-line test invoice held 2 rows where 3 fit). Fixed by reading the footer from each company's own letterhead image
    (`placeStamp` / `footerStartMm`: the bottom 40 % drawn on a canvas over white, first row with 3 or more dark pixels):
    the stamp goes 2 mm above it (floor 12 mm, cap 75 mm), published as `--stamp-bottom` for the print and measuring CSS,
    and the reserve becomes `stampBottom + 34.3 + 4` mm. Anything that stops it (image not decoded yet, tainted canvas,
    no 2D context) keeps the old 43 mm / 85 mm, so the worst case is the previous behaviour. Measured stamp positions:
    Yakam 26.7, Factory 25.9, Al Watanyia 43.2 mm. The 34.3 mm is the stamp block (110 px image, margin, label); change it
    together with `.lh-stamp-img`'s `max-height`. A tighter clearance leaves the "Authorized By" label about 3 mm above
    Yakam's footer rule; 4 mm clearance and 7.7 mm gap (the first version) is airier but gives page 1 one row less.
    Unread so far: a letterhead with a faint full-width watermark in its bottom 40 % (luminance 240 or more is treated as
    paper) would let the stamp sit over it, which is harmless with a transparent stamp. Per-company positions are not a
    setting anywhere; if one is ever needed, put it on the company next to `stamp_image`, and let it override the scan.
    Other levers that were measured and NOT used: a 90 px stamp (almost no gain), and narrower money columns (112/112/124
    px instead of 140/140/150: the 24-line invoice drops from 7 pages to 5, 4 rows on page 1; a visual change nobody has
    asked for yet). The description column is only about 130 px wide because the five numeric columns take 522 of 680 px,
    which is why one catalogue-style description wraps to 7 lines.
    How it was verified, and how to repeat it (a unit test cannot see layout): render `buildInvoiceHTML` with a stand-in
    letterhead and a transparent stamp in headless Chrome (`puppeteer-core` is in `packages/pdf`), print to PDF with
    `preferCSSPageSize`, and with PyMuPDF (`fitz`) list the words whose box intersects the stamp band (x 225 to 370 pt,
    y 623 to 720 pt on A4, minus the stamp's own "AUTHORIZED BY" / "FNC"). Also assert that rows 1..N each appear exactly
    once, or an empty page passes trivially (it did, first). The old code fails it on the user's case; the new one is clean
    on six invoice shapes (short, 9 mixed rows, 20 rows, 5 very tall rows, one row taller than a sheet, no rows), four of
    them also with bank details. Regression test (stand-in layout, runs the real generated script):
    `apps/web/src/lib/__tests__/invoiceHtmlPagination.test.ts` (14 tests, the stamp placement ones use a fake image and
    canvas); each safeguard was mutation-checked. Local fake data: five `TESTPAG-0x` invoices on contract BA-3437-2021 of
    Nishtimani Yakam in `fnc_erp_dev` (the local Yakam stamp is an opaque JPEG, so the bug only shows once a transparent
    stamp is uploaded). Related to #40 (a table
    that cannot adapt to the room it has) and #23 (one thing, several code paths).

54. **A document built as an HTML string puts database text in as markup, and the iframe that shows it runs scripts.**
    Every `apps/web/src/lib/*Html.ts` builder (invoice, PO, requisition, Store In, Store Out, expense claim, payment
    voucher) interpolates names, descriptions and addresses straight into a template literal, and the page shows the result
    with `<iframe srcDoc=...>` with NO `sandbox`, so the document runs with the app's own origin. A line description of
    `<img src=x onerror=...>` on an invoice ran in the browser of everyone who opened it, and the public QR verification
    page (`InvoiceVerifyPage`, token only, no login) renders the same HTML. Found while reading `invoiceHtml.ts` for
    another change, not exploited; confirmed by test, not in the field. Four ways in, all fixed for the invoice:
    (a) element text and attribute values: `esc()` (`apps/web/src/lib/htmlEscape.ts`, the five characters `& < > " '`);
    (b) an image source placed in `src="..."` or a CSS `url('...')`: a quote or a `)` ends it and carries markup
    (`x');}</style><script>...`), so `safeImageSrc()` accepts only a `data:image/(png|jpeg|gif|webp|svg+xml)` URL with a
    quote-free payload or an `http(s)` URL with no quote, bracket or space, and the invoice drops anything else;
    (c) text that reaches the page through a JS string and then `innerHTML` (the pagination script builds the page
    footers that way): escape it as HTML first and then as a JS literal (`jsStringLiteral`), in that order;
    (d) numbers and enum words (status, currency) are strings too: wrap them as well.
    How to spot it: grep `lib/*Html.ts` and any `srcDoc=` / `document.write(` for `${x.field}` with no `esc(`, and read
    every `innerHTML =` in a generated `<script>`. Regression test: `lib/__tests__/invoiceHtml.test.ts` puts a hostile
    string in EVERY field of both the standard and the letterhead invoice (bank block, company name, image sources)
    and asserts no extra `<script>`, no `on*` attribute, and that the text is shown literally; each `esc` / `safeImageSrc`
    call was removed in turn and the test failed. **Still open: the six sibling builders above and
    `PaymentVoucherDetail`'s `document.write`**: about 330 interpolations, none escaped. Do them one at a time with the
    same hostile-field test, because each document's look must stay identical. A `sandbox` on the iframe is NOT the
    fix by itself: the invoice's own pagination script needs `allow-scripts`, and without `allow-same-origin` the page
    can no longer call `contentWindow.print()`.

55. **One label, two fields ("RFQ #"); and a new header field with three builders and two meanings of "empty".**
    The invoice header's "Contract No." printed `project_contracts.contract_number`, our internal reference
    (`BA-3437-2021`, and `IMPORT-BA-...` on 40 of 45 invoiced contracts), when the client expects its own contract / PO /
    RFQ number. That lives in `projects.rfq_number` (labelled "RFQ #" on the project form and detail page; values like
    `PO 4500140630`, `RFQ098`, `025/PC/24`, filled on 23 of 45 invoiced projects). The Projects LIST column headed
    "RFQ #" deliberately shows `contract_name` instead (`ProjectsPage.tsx`, filled on 2 of 45): so "RFQ #" is two
    different fields depending on the screen. Before wiring anything to "the field called X", find the column
    behind the label on the screen you were pointed at.
    Design of the invoice header block (migration 311, `project_invoices`: `client_contract_no`, `bill_to_address`,
    `deliver_to_address`, `delivery_date`, `period_of_performance`): the invoice keeps its own copy, prefilled from the
    project, editable on the create wizard and on the edit screen. NULL means "never set" and the value is derived from
    the project at read time (so the invoices made before the migration print a useful header); '' means the person
    cleared it on purpose and it stays blank. A DATE column cannot hold '', so clearing Date of Delivery falls back to the
    project's actual end date. One helper, `services/gateway/src/lib/invoiceHeader.ts`, decides all of it, because three
    code paths build the invoice shape (`projectInvoice`, the re-fetch inside `updateProjectInvoice`, and the public
    `/verify/invoice/:token` route) and a field added to some of them reads as empty on the others (#23, #34, #43).
    Two details worth keeping: the wizard sends the header only when the person touched it (`header: null` otherwise,
    and the server derives the same defaults), and the edit screen sends only the fields that CHANGED
    (`changedInvoiceHeader`), so saving a line edit on an old invoice does not freeze the derived values as if somebody
    had typed them. The create form's prefill comes from a query over the same derivation (`projectInvoiceDefaults`), so
    the form and an old invoice cannot disagree. Tests: `services/gateway/tests/invoice-header-fields.test.ts` (real
    Postgres through `ApolloServer.executeOperation`; the three builders compared; tenancy; validation; seven
    mutation-checked safeguards), `components/ui/__tests__/InvoiceBuilder.test.tsx`,
    `components/projects/__tests__/InvoiceHeaderFields.test.tsx`, `lib/__tests__/invoiceHtml.test.ts`.
    Tooling traps met on the way: PowerShell's `ConvertFrom-Json` refuses `en.json` (it has `Company` and `COMPANY`
    keys; use Node), and `Get-Content | Set-Content -Encoding utf8` on a file with `→` or `–` turns them into
    mojibake and adds a BOM (edit those files with Node or the editor tools, never a PowerShell round trip).

56. **An approved edit that rewrites one copy of a value leaves its other copies, and the control that reads them, on
    the old value.** A requisition line holds its price in four places: `unit_price` (the total is built from it),
    `market_price` and `verified_price` (what Market pricing and Price verification recorded; the Lines table shows
    both) and `approved_unit_price` (frozen at approval; Items Bought flags a purchase above it plus the company's
    tolerance, 5 % up to 25,000 IQD / 20 USD). `applyRequisitionEditChanges` wrote only the edited field and the total.
    REQ-2026-0057 (Al Watanyia): an admin approved 148 to 145 and the table kept 148 under Market and Verified price
    beside a total of 1,160 (REQ-2026-0056 the same). It was more than a label. REQ-2026-0077 (Nishtimani Factory):
    58,000 to 64,000 approved, the buyer bought 20 at exactly 64,000, and the purchase was flagged over tolerance
    against the stale 58,000 (ceiling 60,900), so a price an admin had approved needed a second approval; a price DROP
    kept the old, higher ceiling (REQ-2026-0055: 3,500 to 2,000 left 3,675 unflagged). All five post-approval price
    edits on production were stale. The PO side had fixed the same thing for `market_price` long before (comment in
    `applyPOEditChanges`), so this is #23 / #34 / #43 again: one of two code paths fixed. How to spot it: a price
    column that disagrees with the total on a line that had an edit approved; `unit_price` different from
    `approved_unit_price` on a line with an `edit_approved` row in `requisition_approval_log` and no purchase yet.
    Fix: when a `unit_price` edit is applied, `market_price`, `verified_price` and `approved_unit_price` move too, but
    only the ones that are already set. Before a stage is reached they are empty, and a draft-stage price must not
    become a "market price" (the Market pricing form pre-fills from the line's saved `market_price`). The old value
    stays in the request's `changes` and the requisition log. Do NOT repair this generally ("every line where
    `market_price` differs from `unit_price`"): after Price verification that difference is normal, the verifier's
    price replaces the quote. The five lines edited before the fix are corrected by
    `packages/db/scripts/requisition_price_edit_stage_prices_backfill.sql` (dry run by default, refuses unless it
    finds exactly those five, `-v apply=1` to write; its SELECT and UPDATE were run from the file against a synthetic
    line before use). Tests: `services/gateway/tests/requisition-edit-price-stage-fields.test.ts` (real Postgres
    through the real submit, approve and `recordLinePurchase`; each safeguard mutation-checked: without the
    approved-price update 3 fail, without the verified-price update 1, without the "only if already set" guard the
    no-invented-prices test fails). Not checked: whether quantity, description or unit-of-measure edits leave stale
    copies (stock-line quantities against their Store Out: 0 mismatches). Same family, not fixed: a line's from-stock
    `store_price` / `store_price_currency` is a copy taken at Inventory Check and never refreshed when Inventory later
    corrects the product's cost or currency (REQ-2026-0133, Pipe 1.5" PVC: IQD on the line, USD on the product, 36
    seconds after the confirm). Tooling traps: when mutation-checking a file that also holds someone else's
    uncommitted work, swap only the exact line and swap it back (check it matched once), never copy the whole file and
    restore it; and `CREATE TABLE AS`, even `TEMP`, is refused inside a read-only transaction, so a "forced read-only
    dry run" cannot build a working table (the production dry run caught it before anything was applied).
