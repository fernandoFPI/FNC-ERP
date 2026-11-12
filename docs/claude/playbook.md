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
    pages made by the script are not `page-mid`. `makePage()` in the totals overflow used to create `page-mid` pages too, and that did print
    an empty sheet (NY-INV-2026-0011); fixed, see #63.
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

57. **A "fix it and resubmit" path that only the people who never file can use, built on an edit that deletes and
    re-inserts its children.** A rejected expense claim was a dead end. `POST /:id/reject` set the terminal
    `rejected`; `PUT /:id` and `submit` accepted only `draft`; and the Edit button needed `finance.expenses.edit`.
    But 8 of the people who file claims (58 of 105 claims on production) hold no `finance.expenses.*` key at all:
    they file through the self-service route (`request-self`, login only), cannot open the claim page (route needs
    `finance.expenses.view`) and see a read-only popup built from `/mine`, which had the rejection reason in its data
    and never rendered it. EXP-2026-0043 (Al Watanyia, 19 lines) was rejected today with "Line 10 has an incorrect
    price": lines had no number (they sorted by `expense_date, id`, a random uuid, so same-date lines had no order),
    so the approver counted rows by hand and typed "10", and the employee could only refile everything. 13 rejected
    claims existed; the reasons were "upload the receipts" (the most common), "correct category", "line 10".
    How to spot it: ask, for every "send it back to the author" state, WHO the author is and whether the control that
    leaves that state is gated by something the author holds (compare the owner's `user_permissions` with the
    permission on the edit route, query it on production). Fix (migration 312, `POST /:id/revise`): a rejected claim
    stays `rejected` (so the 13 existing ones become fixable at once, no status migration) and the filer, or an admin,
    can edit and resubmit it; who may is decided by ONE function (`canReviseClaim`) used by the route and returned as
    `can_revise` on the reads, so the button cannot drift from the server (#24). Lines carry a stable `line_number`
    (a trigger hands out the next from `expense_claims.line_counter`, so no insert path can forget it and a removed
    line's number is never reused) and optional per-line flags like requisitions (`flag_reason`, addressed on
    resubmit, resolved by an approver); flags are optional here, unlike requisitions, because about half the rejections
    are about the whole claim ("wrong company").
    Three traps in the old edit path that the new one had to avoid: (1) it deleted every line and re-inserted them, so
    each edit gave every line a new id and the 109 line-level receipts on production
    (`document_attachments.entity_type='expense_claim_line'`) were left pointing at deleted rows, and a number or a flag
    could not survive. Match children by id: update in place, insert the new, delete the left-out (with their receipts
    and the `files.status` bookkeeping `removeAttachment` does). (2) The edit screen blanked every line's category
    (`category_id: ''`) and the API demanded one per line, so every edit meant re-picking every category; the editor
    sends the line's own category and the server keeps its GL account when it is unchanged. (3) The route resolved a
    reimbursement account that self-service claims deliberately do not have and threw for a currency without a default
    cash account; the new route never touches it and only clears it when the currency changes, so Post Payment
    resolves it again (it prefers a stored one, which would be the wrong currency).
    Smaller things met on the way: a `total_amount` summed in JS (`reduce`) is now summed in SQL after the writes; the
    reject route wrote no audit row (now does); a claim resubmitted after being rejected at `approved` must clear
    `approved_by/at`; the old rejection becomes a "Previously rejected" note, not a live red banner (the banner is keyed
    on `status`, not on `rejection_reason`, which stays on the row as history).
    Test traps: (a) PostgreSQL `42P08` ("inconsistent types deduced for parameter") when one `$5` is assigned to a
    `varchar` column and compared in a `CASE`: cast every use (`$5::varchar(3)`); (b) test users sharing one
    `refresh_token_hash` string silently lose their session (`ON CONFLICT DO NOTHING` on the unique hash), which shows
    up as a wall of 401s, not as a setup error: suffix the hash with the user id; (c) a leftover session from a
    throwaway debug test has the same effect on the next run; (d) a `Fragment` is needed for a `<tbody>` child that
    returns two `<tr>`s. Mutation-checked: 14 backend safeguards (owner check, finance.expenses.edit not extending a
    rejected claim, company scope on revise / reject / resolve, approval cleared on resubmit, flags addressed on
    resubmit, receipts removed with a line, line ids from another claim, duplicate ids, neither-reason-nor-flag) and 13
    web ones; three first survived (duplicate line id, popup Edit gating, banner on a non-rejected claim) because the
    assertions were too loose, and were tightened. Regression tests:
    `services/finance/tests/expense-claim-revise.test.ts` (real Postgres through supertest, 30 tests, the owner is a
    plain `user` with no permission), `apps/web/src/components/finance/__tests__/{ExpenseClaimEditor,MyExpenseClaimModal}.test.tsx`,
    `pages/finance/expenses/__tests__/ExpenseClaimDetail.test.tsx`, `lib/__tests__/{expenseClaimFlags,expenseClaimHtml}.test.ts`.
    The migration's backfill (numbering existing lines in the order everyone sees today) was re-run on real dev rows in a
    transaction that rolls back, against the `(expense_date, id)` order. Not verified in a browser: the screens
    themselves (layout, RTL, the receipts panel inside the popup). Still open, not part of this change: the list page's
    status maps have no `audited` entry (46 claims on production), and `expenseClaimHtml.ts` interpolates unescaped
    strings (#54).

58. **An approval step with no "send it back", and a shared shape that more than one reader builds.** A project
    invoice goes draft, review, approved, issued, and from `review` the only button was Approve
    (`InvoiceDetail.tsx`, `routes/invoices.ts`): an approver who saw a wrong line had to tell the creator outside the
    system. Approve is gated by the same key as edit (`projects.invoices.edit`), so there is no separate approver
    permission and nobody to hand a rejection to except whoever can edit. Fix (migration 313, the expense claim flow
    of #57 applied to a second document): `POST /:id/reject` sends a `review` invoice back to `draft` with optional
    per-line flags and an overall reason, `submit-for-review` marks the open flags "addressed", `POST
    /:id/lines/:lineId/resolve-flag` lets an approver confirm a fix. It lands in `draft` (not a new `rejected` status
    as for expense claims) because a draft already has Edit, Submit for review and Void, nothing was posted yet
    (sources are only marked invoiced at Approve, so there is nothing to undo), and no existing rows are stuck. The
    gate for reject and resolve is the same as Approve, so nobody gained a permission. The reject panel asks for ONE
    reason at a time: the invoice-level one while no line is ticked, each ticked line's own once one is (the server
    composes the invoice's reason from them); a reason typed before the first tick is hidden and not sent.
    Three things this work turned up. (1) *Three readers build the invoice shape*, as #55 already said: the
    `projectInvoice` query and the re-fetch inside `updateProjectInvoice` each carried their own copy of the line
    mapping, and the PUBLIC QR page (`routes/verify.ts`, no login) a third. Flags are internal review notes, so they
    had to reach the first two and never the third. The two app readers now share one SQL and one mapper
    (`services/gateway/src/lib/invoiceReview.ts`, a test asserts both return identical flags); the public route maps
    explicit fields (no row spread, so a new column cannot leak) and a test fetches it with a flagged invoice and
    checks neither the reason text nor the words "flag" / "rejection" appear. The printed invoice gets the same
    treatment (`invoiceHtmlReviewNotes.test.ts`: the page passes the builder the whole GraphQL invoice, which now
    carries the notes). (2) *A global stub outlives its test file.* The gateway suite runs every file in one process;
    `mobile-sync.test.ts` replaced `fetch` with `vi.fn()` in two tests and never restored it, so any later file that
    calls `fetch` got `undefined`: the new public-page test (which sorts after it) passed alone and failed in the full
    run with "Cannot read properties of undefined (reading 'status')", 3 ms in. Spot it by running the failing file
    alone and then after its alphabetical predecessors; fix is `vi.unstubAllGlobals()` in an `afterEach` (done there,
    verified by restoring the original file and watching the two files fail together). (3) Line numbers on an
    invoice are positional: `updateProjectInvoice` renumbers lines 1..n on every save, so unlike expense claims
    (#57) a removed line shifts the rest. A flag stays attached to its own line, so only the "Line N" wording
    inside an old overall reason can go stale; left as is.
    Not changed, worth knowing: the edit mutation allows editing in every status, even issued or paid, with only a
    currency check; and there is no separation of duties (the creator can approve or reject their own invoice, as
    with Approve today). Production held 13 project invoices (12 draft, 1 in review, none ever approved), so there was
    no data to migrate. Tests: `services/projects/tests/invoice-review-flags.test.ts` (real Postgres through
    supertest, 17 tests, with an editor, a view-only user and another company's admin; 14 safeguards
    mutation-checked), `services/gateway/tests/project-invoice-review-flags.test.ts` (real ApolloServer, the two
    readers and the public route), `apps/web/src/pages/projects/invoices/__tests__/InvoiceDetail.test.tsx` (18 tests,
    10 mutation-checked). Header fields (migration 314, same work): the one-reason-at-a-time rule left a mixed case, a wrong line plus a wrong
    Bill To, with nowhere to say so, so the ten fields of the printed header (Date of Issue, Due Date, Invoice No.,
    Deliver To, Bill To, Contract No., Job, Period of Performance, Date of Delivery, Reference) can be flagged like
    lines. One row per field per invoice in `project_invoice_header_flags` (CHECK on the field list), same lifecycle
    (raised, addressed on resubmit, resolved by the approver), `POST /:id/header-flags/:field/resolve-flag`. The
    GraphQL `headerFlags` list on `ProjectInvoice` is NULLABLE on purpose (#38): the other mutations that return an
    invoice do not fill it, and a non-null list would null the whole invoice. The composed reason lists header fields
    before lines. Invoice No., Job and Reference are not editable on the invoice (generated / taken from the project);
    they can still be flagged and the card says "Not editable on the invoice". The invoice page never showed the header
    values in normal view (only the PDF tab and Edit), so reject mode draws a card of all ten with their current
    values and outside it the card shows only flagged fields. Three copies of the field list (the CHECK, the projects
    service, the web) are pinned to each other (the #30 pattern): the projects test reads `pg_get_constraintdef`, the
    web test reads the migration file and the service source. A trap met on the way: once the header card added ten tick
    boxes above the lines, every existing test that clicked `getAllByRole('checkbox')[n]` clicked a header box; scope
    such queries to the table they mean. Tests: 15 more in `invoice-review-flags.test.ts`, 2 more in the gateway test, 13
    more in `InvoiceDetail.test.tsx`, `lib/__tests__/invoiceHeaderFlags.test.ts`; 13 backend and 12 web mutations, one of
    which first died on a SQL error (an ambiguous column) instead of the intended test and was tightened.
    Not verified in a browser. Related to #57, #55 and #54.

59. **Making a step happen by itself breaks every caller that did "action, then the manual next step", and every cleanup
    that did not know the step creates rows.** Market pricing and Items Bought used to need a position for the WHOLE
    requisition (`procurement_officer`, `buyer`), so an organizer who bought some items himself could not record it.
    Migration 315 lets the organizer take lines (`po_lines.owner_handles`); each side submits its own part of Market
    pricing (`requisitions.owner_pricing_submitted_at` / `procurement_pricing_submitted_at`, both cleared in
    `reqTransition` whenever the stage is entered) and the requisition moves on when every side that has lines has
    submitted; Finish Buying now happens by itself the moment the last purchased line is bought or marked short, every
    purchase has a receipt and every over-tolerance purchase is approved (`tryAutoFinishBuying`, called after
    `recordLinePurchase`, `markRequisitionLineShort`, `resolveRequisitionLineFromStock`, `approveTolerancePurchase` and
    an `attachFile` on a `po_line_purchase`). The auto step is what bit: 37 existing gateway tests in 5 files bought the
    last line and then called `finishBuyingRequisition`, which now threw `Requisition must be in items_bought status to
    finish buying`, and two suites failed in `beforeAll` with `purchase_orders_requisition_id_fkey` because their cleanup
    deleted `po_lines` and `requisitions` but not the child POs the auto step now creates, leaving rows on the shared
    test DB. Fix: the manual button returns the requisition unchanged when it is already in `sourcing` (a click on a
    stale screen is not an error), and the cleanups delete `po_lines` by `po_id` and `purchase_orders` first. How to spot
    it: before wiring an automatic transition, grep every test, web screen and script that performs the triggering
    action and then the manual next step; any cleanup that deletes `requisitions` needs the child `purchase_orders`.
    Rules kept for such a step: best effort (caught and logged; the action that triggered it has already committed and
    must not fail because of it), the manual button stays as the fallback, one readiness function shared by both
    (`finishBuyingNotReadyReason`), and a row lock (`FOR UPDATE`) in the fork so two last actions landing together do
    not both do the work. `reqTransition` also locks and re-checks the status, so the final state is the same without
    the new lock; the lock only stops the loser from doing the work first (and burning a PO number), so the race test
    asserts the LOSER'S message (`must be in items_bought status`, not `Expected 'items_bought', got ...`), which is the
    only thing that tells the two apart.
    Who may act on a line is decided in ONE place on each side: `callerMayBuyRequisitionLineGW` (admin, buyer position,
    or the organizer for a line with `owner_handles`) on the server and `canBuyLine` on the Items Bought page. The
    organizer is limited to his own lines; procurement and admins can step in on any line, including pricing and
    submitting the organizer's part (`side: OWNER`). `submitRequisitionMarketPricing` without a `side` still means
    procurement's, so an older client keeps its single submit; a requisition where the organizer took nothing behaves
    exactly as before (procurement's one submit advances it). A side with no lines counts as done, and the organizer's
    part additionally requires every line he took to have a market price (procurement's keeps the old rule).
    Every line says who handles it: a "Handled by" column in the requisition Lines table (right after Item, from Market
    pricing on, optional in the Columns menu; a line fully covered from stock shows a dash because nobody buys it) and an
    "Organizer's item" / "Procurement's item" tag on the Items Bought page. The Market pricing cards carry it too. Not
    done: the child PO page does not show it. The marker is the SIDE the line was given to (`owner_handles`); the NAME
    beside it is who has actually acted, from one function used by all three screens (`lib/lineHandler.ts`): whoever
    recorded a purchase on the line (so a procurement buyer stepping in on the organizer's line is named, not the
    organizer), else the organizer on his lines, else on procurement's lines the procurement officer who submitted
    procurement's part (`Requisition.procurementOfficerName`, from `requisitions.procurement_officer_id`, an EMPLOYEE id,
    joined within the same company; null until procurement has submitted, or when an admin without an employee record
    did). That is who PRICED the requisition, not a per-line buyer assignment: procurement has no named person per line
    until a purchase is recorded. The name comes back on both builders that return a requisition (the detail query and
    `getRequisitionForReturn`); each was mutation-checked (company scope, the select itself).
    NOT done: `myRequisitionApprovalQueue` lists a requisition at `market_pricing` / `items_bought` only for
    `procurement_officer` / `buyer` holders, so an organizer who took lines does not see it in his queue (#24); the
    queue is a visibility decision, so it was flagged rather than changed.
    What the mutation checks found: a test that passed for the wrong reason (the "submit outside market pricing" fixture
    had one line, so the transition caught the wrong stage anyway; with a second pending line nothing else stops the
    write, and the status guard is what refuses it), an untested notification (the organizer is told to verify prices
    once, when the last part lands, not after the first), and the race test above. 30 backend and 39 web mutations, all
    killed except one cosmetic badge colour. Web traps met: `SearchableSelect` options choose on `mouseDown`, not
    `click`; in this vitest `vi.fn<[Args], Return>()` takes the argument tuple and the return type separately; the
    `@typescript-eslint/non-nullable-type-assertion-style` autofix turns `as HTMLInputElement` into `!` (#52), so write
    `if (!el) throw`. Tests: `services/gateway/tests/requisition-owner-split.test.ts` (real Postgres, 40 tests: both
    submit orders, taking and handing back a line, the stage guards, the buy gates, the auto finish after each of the five
    triggers, the manual button after an auto finish, the race), the "Market pricing in two parts" block in
    `RequisitionDetail.test.tsx` and the organizer / record-all blocks in `ItemsBoughtPage.test.tsx`. Not verified in a
    browser. Related to #24 (a gate and the list that mirrors it) and #23 (one thing, several code paths).

60. **An approval layer for chosen users, and four traps it turned up (a mark with no home, a screen that shows one company
    and writes to another, a notification the worker cannot read, and a mock that loops).** An admin can now mark users
    whose purchases at Items Bought must be approved by the requisition's organizer before the requisition continues
    (migration 316). Design, and why:
    (a) *Where the mark lives.* Not on `user_company_roles` (one row per user, company AND module), not a PO position
    (positions belong to employees, come from a CHECK-constrained list, and a normal user has no employee record): its
    own table, `user_purchase_review_marks (company_id, user_id)`, so it works for a procurement buyer and a normal user
    alike. Managed by the same admins as PO positions (`system_admin` or the PO Admin position).
    (b) *The purchase remembers.* `po_line_purchases.needs_organizer_approval` is stamped when the purchase is recorded,
    from the buyer's mark at that moment, so marking someone later never traps a requisition already in progress and
    un-marking never frees a purchase that already exists. Existing rows default to false (nothing in flight changed).
    (c) *One rule, three consumers.* `canApproveMarkedPurchaseGW`: the organizer or an admin, never the person who bought
    it (so when a normal user buys his own lines only an admin can approve). It decides `approveItemsBought`,
    `sendBackPurchase` and the per-purchase `caller_can_approve` the page reads, so the page keeps no copy; the queue
    mirrors it in SQL (`bought_by IS DISTINCT FROM organizer`), because a queue that re-implements a gate drifts (#24).
    (d) *The wait is a fourth Finish Buying gate, last on purpose,* so that "only the organizer is missing" is
    recognisable (`ORGANIZER_APPROVAL_PENDING_REASON`) and is the moment the organizer is notified. No new requisition
    status: the existing auto-finish simply continues the moment the last approval lands. An approval step needs a
    send-back as well (#58): `sendBackPurchase` removes the purchase and its receipt links in the same order as
    `rejectTolerancePurchase` (purchase first, #21), logs the reason and tells the buyer.
    The traps:
    1. *A Settings screen with a company switcher that writes to the session company.* The user's Roles tab shows one
    company at a time, but `userPOPositions` / `assignPOPosition` (and my first version of the mark) act on the admin's
    SESSION company, so an admin looking at Company A could silently mark someone in Company B. The mark now takes an
    explicit `companyId` (the one the tab shows); another company than the session's needs `system_admin`, and the target
    must hold an active role in the company shown. The PO positions on the same tab had the same flaw and were fixed the
    same way (user said "fix point 3"): `userPOPositions(userId, companyId)` lists the company shown (omitted still means
    every company's, which the Stock Adjustment and Pending Catalog screens rely on), `assignPOPosition` takes
    `companyId` and either `employeeId` (the Positions page) or `userId` (the Roles tab; the server finds the user's
    employee record in that company), and `removePOPosition` finds the position's own company. Another company needs
    `system_admin`. It also exposed how broken the Add Position modal was: it sent `poPositions[0]?.employeeId ?? ''`, the
    employee of the user's FIRST position (possibly another company's, giving a row whose company and employee disagree),
    or an empty string for a user with none, so a first position could never be added there; and nothing checked that the
    employee, or the typed-in project / department / branch id, belonged to the company. The server now checks all of
    them. Still open: the modal asks the admin to type a raw project / department / branch UUID. How to spot it: a
    per-company setting on a screen that has a company switcher; check which company id the mutation really uses.
    2. *A notification payload whose id key the worker does not read.* The worker's `REQ_*` handlers read
    `payload.requisitionId`; `notifyUserGW` sends `poId`. Found on production while designing this: 192
    `REQ_PRICE_VERIFICATION_REQUIRED` events failed, five attempts each, `invalid input syntax for type uuid:
    "undefined"` (74 others, sent by the helper that does carry `requisitionId`, were delivered). That is
    `submitRequisitionMarketPricing`'s "Price verification required" notice to the organizer, which has never reached
    anyone. The new notices go through `notifyUserForRequisitionGW` (payload `{ userId, requisitionId, ... }`), and a test
    asserts the key. The existing "Price verification required" call in `submitRequisitionMarketPricing` was moved to the same
    helper once the user said "fix it" (regression test in `requisition-owner-split.test.ts`: the payload carries
    `requisitionId`, no `poId`, and goes to the organizer); the 192 old failed rows are left as they are (stale notices
    must not be replayed). Repeated failures also count toward the worker's `notifications` circuit breaker (5 failures
    within a minute opens it for 2 minutes), which could delay other notices. How to spot it: a `service_outbox` row with
    `status='failed'` and the same `last_error` on every attempt; compare the payload keys of the failing rows with the
    ones that were delivered.
    Found beside it, and fixed on the user's "same for that other finding": the worker had no `case` for
    `REQ_INVENTORY_CHECK_REQUIRED` or `REQ_STORE_PRICING_REQUIRED`, and a notification event type it does not know is only
    logged ("unknown notification event") and then marked delivered, so those notices were silently dropped (53
    inventory-check events on production show `delivered` with no notification of that type). Both now share the REQ_
    block, so the store keepers and store-pricing holders get the in-app notice AND the email, governed by the existing
    `email.requisition_pricing_stage` setting (on by default; Settings > notifications turns it off; its description now
    names inventory check). The old dropped events are not replayed. Guard test:
    `services/worker/tests/req-notification-handlers.test.ts` reads the gateway and worker sources and fails if a
    `REQ_*` type the gateway sends has no worker case, or if one is sent through `notifyUserGW`. How to spot it:
    `service_outbox` rows `delivered` for a type that has no rows in `notifications`.
    3. *A mock that returns a fresh object each render loops a component whose effect depends on query data.* The roles
    tab does `useEffect(..., [permsData])` and sets state inside it; my mock built `permsData` anew on every call, so the
    worker ran out of memory (`ERR_WORKER_OUT_OF_MEMORY`) instead of failing a test. Build mock results once and hand back
    the same reference. Also: the page's `Input` does not tie its label to the box, so `getByLabelText` cannot find it.
    4. *My own edit-file format kept the blank line before the next `=== FILE` marker as part of the last replacement,*
    leaving stray blank lines (some inside a `gql` template, which no linter flags). After any scripted edit, lint the
    hunks and scan template literals for blank lines.
    Tests: `services/gateway/tests/purchase-organizer-approval.test.ts` (real Postgres through the real mutations and the
    real schema, 44 tests: marking incl. another company, the stamp, the wait in either tolerance order, approve and send
    back by each role, the buyer-is-organizer and admin-is-buyer cases, the queue, the notification and its key),
    `UserRolesTab.purchaseReview.test.tsx`, and the approval blocks in `ItemsBoughtPage.test.tsx` and
    `RequisitionDetail.test.tsx`. 34 backend and 19 web mutations, all killed. Not verified in a browser. Related to #24,
    #58 and #59.

61. **A printed block that silently disappears when its optional data is unset, and a list gated by a different
    permission than the screen.** "Some invoices print and preview without the bank account information, others are fine."
    The invoice builds its Banking Information block only when `payment_type != 'cash' AND a bank account is chosen`
    (`buildInvoiceHTML`), and `project_invoices.bank_account_id` is nullable with `payment_type` defaulting to
    `wire_transfer`; nothing sets the account at creation and nothing checked it before the invoice left draft, so an
    invoice with no account simply printed without the block, no error anywhere (NY-INV-2026-0004, already PAID, and
    AW-INV-2026-0001, a draft). Second cause, same symptom: the page finds the account by looking it up in the
    `bankAccounts` query, which needs `finance.ar.view`; a user without it (two people on production) gets no list, so the
    block is missing for them on EVERY invoice, including ones that do have an account. How to spot it: compare the
    invoices that print with the ones that do not on `bank_account_id IS NULL` and `payment_type`; then ask the same user
    to open a good invoice (still missing = the permission, not the data). Fix: one shared check
    (`services/projects/src/lib/invoiceBankAccount.ts`, `invoiceBankCheck`) used by `submit-for-review`, `approve` and
    `issue`: a wire-transfer invoice needs an ACTIVE account, Cash is exempt, a deactivated account counts as none, a
    wrong-status error still wins, the lookup is scoped to the company, and the refusal is a 409 `BANK_ACCOUNT_REQUIRED`.
    The submit/approve/issue transitions live only in the projects service (the gateway's only status writers for
    project invoices are payment recording, void and cancel), so there is no second path around it. The page shows a red
    warning and disables the three buttons, and the warning is keyed on the invoice's OWN `bankAccountId`: only the
    "chosen account is inactive" wording needs the loaded list, so someone who cannot load it is never told the invoice
    has no account when it does. Data fix for the paid invoice: set to the account the client's other invoices use after
    a manual `pg_dump` backup, one row, one `audit_log` row (the edit mutation refuses issued/paid invoices, so it had to
    be SQL). Test traps: tightening a rule breaks every fixture that relied on the old permissive behaviour (17 existing
    projects tests got 409 until they attached an account: `attachTestBankAccount` in `tests/setup.ts`, whose cleanup
    deletes only test accounts no invoice still points at because `bank_accounts` has no `company_id`); a new
    `role="alert"` warning broke 3 older tests that assert on the single alert, so the warning has no role; the
    "bank list unavailable" case needs the query mock to be configurable (`bankQueryData`) or the permission half of the
    bug cannot be tested. Mutation-checked: 10 web and the server safeguards (cash exemption, inactive account, the
    loaded-list guard, each button held back, the status exclusion, the wording). Tests:
    `services/projects/tests/invoice-bank-account-required.test.ts` (real Postgres, 12) and the "needs a bank account"
    block in `InvoiceDetail.test.tsx`. Still open, by the user's choice or out of scope: `setInvoiceBankAccount` checks
    only that the caller is logged in; a user without `finance.ar.view` sees no hint that the list could not load (the
    user grants the permission instead); a bank account deactivated later makes its invoices need a new choice before
    they can move on. Related to #23 (a rule on one path) and #34 (looks empty while the data is fine).

62. **Page furniture drawn from a page's edge lands in a different place on pages that are built differently.** The
    letterhead invoice's footer (company name and invoice number on the left, "Page N of M" on the right, a rule above
    it) and the "Continued on next page" row inside the table were replaced by one marker per page, bottom right, just
    above the letterhead's footer artwork: "Page N of M" with the note under it on every page but the last
    (`.page-footer-bar` in `apps/web/src/lib/invoiceHtml.ts`; the table's own `tfoot` bar is gone for letterhead invoices,
    the plain layout still has both). In print it is `position: absolute` from the page's own top
    (`top: calc(297mm - var(--stamp-bottom, 43mm) - 9mm)`, valid because every page starts at the top of a sheet) and
    takes no room in the flow, so the pagination budget no longer has to leave space for a footer bar; on screen it stays
    in the flow. `markContinued()` runs last, after the totals block has had its chance to move to a page of its own,
    because that move turns the page it left into a "continued" one (a note written at pagination time would be wrong).
    Traps met: (a) *Continuation pages are not all built the same way.* The pages `paginate()` makes are appended INSIDE
    the first `.page`, so they are inset by its 15 mm side padding; the extra page `fixTrailing()` makes from page 1 is a
    sibling in `<body>`, full width. `right: 15mm` therefore put the marker 29.8 mm from the edge on pages 2+ against
    14.8 mm on page 1 (measured from the PDF, below). Fixed with `.page .page2-break > .page-footer-bar { right: 0 }`.
    The existing continuation header (`.p2-print-hdr`, the INVOICE title and QR on pages 2+) had the same flaw: it printed
    30.3 mm from the edge against 15.3 mm on page 1. Fixed later with a rule of the same shape, see #64.
    (b) *Anchoring a box by its bottom (`translateY(-100%)`) moves its first line when a second line appears.* The page
    number sat 4.6 mm higher on pages with the note than on the last page; a fixed top (two lines high) keeps it at one
    height. (c) *A test that asserted "company text from the database reaches the footer as text"* lost its subject when
    the text left the footer; the check that matters now is the continuation header the script builds with
    `insertAdjacentHTML` from an already escaped string (hostile invoice number, forced split, `invoiceHtmlPagination.test.ts`).
    (d) `tsx` injects a helper (`__name`) into functions passed to puppeteer's `page.evaluate`, which then throw in the
    page: hand it a string. And `python -I` cannot import PyMuPDF installed in the user site; leave `-I` off for your own PDFs.
    How it was verified (a unit test cannot see layout): the real HTML printed to PDF in headless Chrome with a stand-in
    letterhead (footer artwork 25 mm up, a stamp, a QR) for 15 row counts from 12 to 42 (2 to 5 pages, including
    layouts where only the totals overflow); PyMuPDF word boxes show "Page N of M" at the same right and bottom distance
    on every page, the note on exactly the pages before the last, nothing from the table in the marker's band. Tests:
    `lib/__tests__/invoiceHtmlPagination.test.ts` (22) and `invoiceHtml.test.ts`; 10 mutations, all killed. Not checked: a
    letterhead whose footer rises higher than the stamp scan expects (the marker follows `--stamp-bottom`, like the stamp,
    so it should move with it); the real company letterheads. Related to #53 (its remarks about an in-flow footer bar no
    longer apply to letterhead invoices) and #23 (one thing built on several paths).

63. **A block that cannot be split, with padding below it, is moved whole to the next sheet: an empty page, then the block
    at the top of an unmarked sheet over the logo.** NY-INV-2026-0011 printed 4 sheets while its own footers said "Page N of
    3": sheet 3 was only the title block, "Continued from previous page" and "Page 3 of 3"; the payment type and Banking
    Information block sat alone at the very top of sheet 4, over the letterhead's logo, with no title block and no page
    marker. Cause: the page the script makes when the totals / payment block does not fit under the last rows
    (`makePage()` in `fixTrailing`) still had the class `page-mid`, which adds `padding-bottom: 85mm` in print. Chrome has no
    legal break between the last block of a box and the padding under it, and the payment section is
    `break-inside: avoid` (about 85 mm tall with an intermediary bank), so the block, the 85 mm and the first page's own
    50 mm bottom padding (continuation pages are nested inside it) all had to fit under the header: 87 + 84.7 + 85 + 50 =
    306.7 mm against a 297 mm sheet. They did not, so the section went to the next sheet, which as a continuation fragment
    has no top padding (hence over the logo). The script measures in `html.measuring` mode, which never included
    `page-mid`'s padding, so it believed page 3 fitted. It hit every WIRE-TRANSFER invoice of 5 or more rows (18 of 22 row
    counts tried, 1 to 30); with 1 to 4 rows the new page is a sibling of the first page, not nested in it, so the 50 mm was
    not glued on; cash invoices have a much smaller block, which is why the sweep behind #62 (cash) missed it. It is older
    than the page-marker change: the code from before it fails the same way (page number on the wrong sheet), and #53(f) had
    flagged `makePage()`'s `page-mid` for exactly this. Fix: `makePage()` makes a plain `page2-break` (`newLinesPage` already
    did); the static, script-less fallback keeps `page-mid` on its non-last pages. How to spot it: the number of sheets is not
    the "of M" on the markers; a sheet with only a title block; a block at the top of a sheet over the logo. How to check (a
    unit test cannot see fragmentation): print the real HTML to PDF in headless Chrome for row counts 1 to 30 with a
    wire-transfer invoice that has intermediary bank details, and with PyMuPDF assert for every sheet a page marker that
    matches its position, a title block from sheet 2, some table / totals / payment text, and sheets == the markers' total; do
    it for the tightest letterhead too (footer artwork 41 mm up, Al Watanyia's). Before the fix 18 of 22 failed; after, 0 of 22
    and 0 of 7. Test: `invoiceHtmlPagination.test.ts` ("no page-mid" on the page that receives the moved totals; the old
    class makes it fail). General rule: anything in a print stylesheet must satisfy "content bottom + every padding glued under
    it up to the end of the nearest breakable ancestor <= the sheet", and the measuring mode has to include the same paddings.
    Related to #53, #62.

64. **Anything drawn at a fixed spot in a letterhead's header corner lands on some company's artwork.** Al Watanyia's
    printed invoice (AW-INV-2026-0003) had the verification QR code on top of the Arabic company name in the top right of
    the letterhead, and on pages 2 and 3 the invoice number sat on the same Arabic text. The corner was free on the
    letterheads the layout was tried on (Yakam, Factory), and the invoice cannot know what a company's artwork looks like:
    the header zone is whatever the uploaded image contains. Two things made page 2+ worse: the continuation title block
    sat 15 mm further in than page 1's (the pagination script's pages are nested inside the first page's side padding, see
    #62), which moved it from beside the artwork onto it, and it carried the number under the title, right where the
    Arabic line is. Fix (letterhead layout only; the plain layout keeps its QR in the bottom row): the header corner holds
    only the word INVOICE; the QR code moved to the bottom left of every page, in the footer band the letterhead scan already
    keeps clear (`placeStamp` / `--stamp-bottom`, #53g), where the stamp is centred and the page number sits at the right.
    It is one box per page, `.page-footer-bar` (QR left, page number and "continued" note right, 19 mm high, bottom level
    with the stamp), so the script builds it with the same function for every page it creates and the nested-page offset (`left: 0;
    right: 0`) is written once. Pages 2+ show the invoice number on the row above the rule, beside "Continued from previous
    page", which is below any header artwork, and the title block there got the same `right: 0` offset. How to spot this
    class: a layout element placed by millimetres from the top of the page rather than relative to something the page
    measures; a printout of ONE company's letterhead looks fine and another's does not. Before putting anything in a
    letterhead's margins, check it against each company's letterhead (Yakam's header text ends left of where the QR used
    to sit, Al Watanyia's Arabic text fills it; the footers rise 24 to 41 mm; Factory's header was not looked at); the only
    zone every letterhead has to keep empty is the one above its footer artwork, because the stamp already needs it. How it was verified (layout is invisible to unit tests):
    the real HTML printed to PDF in headless Chrome with a stand-in letterhead that has text filling the top right and a
    footer rising 41 mm, for 8 row counts (1 to 30), and the earlier 25 mm footer sweep for 14 more; PyMuPDF shows exactly
    one 19 mm QR image per sheet, 15 mm from the left edge, bottom level with the stamp, never in the top 60 mm, no text
    overlapping it, no invoice number in the header art region, and the sheet / marker checks of #63 still pass. NOT done:
    scanning the printed QR code (no decoder is installed here; it is the same image, same 19 mm size, on plain white), and
    the real company letterheads. Tests: `invoiceHtml.test.ts` ("letterhead title block and QR code", 6) and
    `invoiceHtmlPagination.test.ts` (3 more, plus the geometry strings); 10 mutations, all killed. Related to #53, #62, #63.

65. **A document step that records a reversal but moves no money, and a derived cost row that is copied once and never
    follows its source.** RTN-NY-PO-2026-0101 (Nishtimani Yakam, 6 of 6 LED strip back to the vendor, 9.00 USD) was a
    correct record that did nothing. The vendor return flow (`createPOReturn` / `approvePOReturn` / `creditPOReturn`) was
    record-only: the 9.00 stayed in `project_cost_actuals` (source `po_direct_delivery`), the PO total never said a return
    existed, and `completePO` posted the whole PO to the project expense and to payable, returned item included. Three
    separate faults sat behind that one question:
    (a) *A reversal that does not write where the original wrote.* The delivery wrote a cost row; the return wrote nothing.
    Spot it: list every writer of a ledger-like table (`INSERT INTO project_cost_actuals`) and ask, for each document that
    can be undone, where its undo writes. The material-return flows already counted `approved | credited` returns as
    returned (`createMaterialReturn`'s returnable-quantity check) while the cost, the journal and the PO page ignored
    them: two parts of the system disagreeing about whether a return had happened.
    (b) *A hard-coded currency label.* `recordDirectDelivery` inserted `'IQD'` as the currency of the cost whatever the
    line's currency, so a USD line booked its plain USD amount labelled IQD (127 rows on production on 2026-11-07, about
    38.9K USD, first on 2 Sept and still being written; Al Watanyia 38 / Factory 18 / Yakam 71). The per-currency cost views
    (migration 304) then showed USD material cost missing from the USD totals and tiny amounts inside the IQD ones. The
    material-return offset (`createMaterialReturn`) had the same literal, and a return mixing two currencies was one IQD
    number adding unlike units. Spot it: `SELECT cost.currency_code, line.currency_code, count(*)` where they differ, and
    grep for a quoted currency in any INSERT that also takes an `amount`. Fix: the cost takes the LINE'S currency; a
    material-return offset is written once per currency.
    (c) *A copy that does not follow its source.* The cost row is `qty x price` copied at delivery. A price edited after
    delivery (`applyPOEditChanges`, `applyAdminPOCorrection`) rewrote the line and left the cost: 15 rows on production
    differed from received qty x price (NY-PO-2026-0101 line 8: 31.50 posted, 21.00 after the edit; NY-PO-2026-0100 line 9:
    36.00 against 3.60). A removed line left its cost behind. Same family as #56 (an approved edit that rewrites one copy
    of a value) and #6 (a total with several writers). Fix: ONE module, `services/gateway/src/lib/directDeliveryCost.ts`
    (add, reprice, drop, offset), called by every path, so they cannot drift.
    Design decisions, so they are not re-litigated: (1) a vendor return takes its value off the project cost and off what
    the PO pays AT APPROVAL, not at credit (the user did not answer the question; chosen because the goods have already
    left and the credit note arrives later; `credited` adds nothing on top). Say so if it is wrong: moving it to credit
    means calling `offsetVendorReturnCost` from `creditPOReturn` instead of `approvePOReturn` and narrowing the status
    filter in `getPONetCurrencyTotals` and the backfill. (2) The offset is a NEGATIVE cost
    row (`po_vendor_return`, source = the return ITEM, unique per item by migration 317), never an edit of the delivery
    row, because the cost table is append-only history like `stock_moves`. (3) The offset needs a delivery cost row to
    cancel: a project PO delivered to INVENTORY costs the project nothing until a Store Out, so returning it takes nothing
    off (test: "cost the project nothing yet"). (4) The PO keeps its lines and `currencyTotals` as ordered; the page shows
    "Returned" and "After returns" per currency from the server (`PurchaseOrder.returnedTotals`, computed in SQL, never
    added across currencies) and the completion journal posts ordered minus returned per currency (a fully returned
    currency posts nothing). (5) A repeated delivery is ADDITIVE at the price current when it arrives (the weighted average
    material returns read); only an EDIT re-prices what was already delivered. My first version recomputed
    `received x price` on every delivery and broke two existing weighted-average tests (expected 12, got 15): a simpler rule
    that changes an existing number needs those tests read before it is kept.
    Also found and fixed on the way: `recordDirectDelivery` updated `po_lines` by line id alone, so a line id from another
    purchase order (or company) could be delivered and charged through this PO's project; the UPDATE now requires
    `po_id = the PO` and refuses otherwise (`not a line of this purchase order`, tested).
    The backfill for rows the old code left (`services/gateway/src/scripts/backfill-direct-delivery-cost.ts`, compiled by
    the gateway build and run on the VPS from `services/gateway` after sourcing `/opt/fnc-erp/.env`, same pattern as #44):
    `node dist/scripts/backfill-direct-delivery-cost.js [--company "<name or id>"]` is a dry run listing four steps: (1)
    relabel USD-line rows labelled IQD to the line's currency (the amount was never converted, so only the label moves);
    rows converted at the old ~1,546 rate are recognised by `fx_rate_to_base <> 1` or an amount 100 times the line's value
    and left alone; (2) re-price stale amounts, ONLY with `--reprice` (it changes a figure someone may have reported on, so
    read the list first); (3) the offset for approved or credited returns that never got one (RTN-NY-PO-2026-0101);
    (4) relabel the material-return offsets of a single-currency direct-delivery return, and REPORT, never change, one that
    mixed a Store Out with a direct delivery or two currencies (its IQD number cannot be split). `--apply --actor-email
    <admin>` does it in ONE transaction, writes one `audit_log` row per project, then re-reads the COMMITTED data on a
    second connection and fails if anything it should have fixed is still wrong or an audit row is missing. Audit rows are
    plain SQL, not `logAudit`: `logAudit` swallows its own errors, and a failed insert inside the transaction would have
    turned COMMIT into a silent ROLLBACK while the script printed APPLIED (#48). Take `scripts/backup-db.sh` first.
    Traps met: (i) *a "report the ambiguous ones" query that flags correct data.* My first step 4 listed every IQD
    material-return row of a return that has a foreign direct line, which also matched returns the NEW code wrote
    correctly (one row per currency: IQD for the stock part, USD for the direct part). Reading the query against what the
    current code produces, then adding a test that runs the real mutation on a mixed return, found it; a backfill's
    "suspicious" filter must exclude what current code writes. (ii) the test fixtures are the OLD state, which the old code
    can no longer produce: build the row with the real mutation, then age it with SQL (relabel to IQD, delete the offset,
    change the price directly), and say so in the test. (iii) a test that plans over the whole company reads other tests'
    rows: scope by a project made per test and clear the cost rows in `beforeEach`. (iv) `createPOReturn` refuses a line
    that was never received, so "a return on a line with no jobsite cost row" needs `qty_received` set by SQL.
    Mutation-checked: 19 on the gateway code (the cost, offset, journal and display paths), 3 on the page and 14 on the
    backfill; two survivors (the Store Out line and the converted-delivery guards of step 4) each got a test and then
    died. Tests: `services/gateway/tests/po-direct-delivery-cost.test.ts` (real Postgres, 18),
    `backfill-direct-delivery-cost.test.ts` (23), one more case in `project-material-return.test.ts`, and
    `apps/web/src/pages/procurement/__tests__/procurement.test.tsx` (the Returned / After returns lines).
    Still open, not part of this change: the stock side of a vendor return on a PO delivered to inventory (the goods are
    still counted as received); `stock_issue` and Store Out `material_return` rows are still labelled IQD (a Store Out is
    costed from the product's own cost, which has its own currency question, #43); the completion journal and the
    direct-delivery cost may both charge the same goods to the project (a known open item, G17, not checked here); a PO funded by an employee advance is
    not netted; the cost uses `unit_price` where the receipt screens use `actual_unit_price`. Related to #6, #23, #44, #48, #56.

66. **A field that meant "the owner" when a document was created by hand silently means "the person who clicked last" once
    a system step creates the document.** Before the requisition split (G1) a purchase order was created by its organizer,
    so `purchase_orders.created_by` and `organizer_id` were the same person and code could read either. The fork
    (`finishBuyingRequisitionCore`) creates the child PO when Finish Buying runs, and it wrote `created_by = auth.userId`,
    the user whose action happened to complete the set (a buyer recording the last purchase, an admin approving the last
    over-tolerance purchase, or the organizer), while `organizer_id` correctly carried the requisition's organizer. On
    production 250 of 297 requisition-linked POs named that person in `created_by` (45 already matched, 2 belong to
    requisitions with no organizer, 0 were anything else). The user saw the buyer's name where the organizer's belonged
    and the organizer "losing ownership". `organizer_id` was never overwritten (checked on every row: 0 differ); only two
    places read `created_by` for a PO: the PO page's "Created by" box (`fetchFullPurchaseOrderGW`,
    `PurchaseOrderDetail.tsx`) and the non-admin gate of `submitPOEditRequest` (`created_by OR assigned_to OR project
    member`, no organizer, so an organizer who was not on the project was refused with "You are not associated with this PO
    or its project": 85 of 297 POs, 82 still open). Every other PO check uses `organizer_id` (`userIsOrganizerGW`).
    Same family as #23 and #24 (a rule that was right for one creation path drifts when a second path is added).
    Decision (the user's, after I recommended the narrower fix of letting the organizer through the gate and showing an
    Organizer box): the forked PO continues the requisition's ownership, so `created_by` is the requisition's organizer,
    falling back to the finisher only when the requisition has no organizer (`created_by` is NOT NULL). Who finished the
    buying is not lost: it stays in `requisition_approval_log` (action `finish_buying`, `actor_id`). Consequence to know:
    the finisher (typically a buyer) no longer passes the `submitPOEditRequest` gate through `created_by`; they still can
    as an admin, an assigned user or a project member. If buyers should keep that, widen the gate; it was deliberately
    not touched here.
    The backfill (`services/gateway/src/scripts/backfill-po-ownership.ts`, compiled by the gateway build and run on the VPS
    from `services/gateway` after sourcing `/opt/fnc-erp/.env`): `node dist/scripts/backfill-po-ownership.js [--company
    "<name or id>"]` is a dry run; `--apply --actor-email <admin>` sets `created_by` to the requisition's organizer in one
    transaction, writes one `audit_log` row per PO with the OLD and NEW `created_by` (so it can be undone from there), then
    re-reads the committed data on a second connection and fails if anything is still wrong or an audit row is missing.
    It only touches a PO whose `created_by` is an actor of a `finish_buying` row of ITS OWN requisition, i.e. exactly what
    the fork wrote: a PO somebody created by hand or a legacy one on a `REQ-MIG-*` requisition keeps its creator; a
    requisition without an organizer is counted and left. `organizer_id` is never written. Take `scripts/backup-db.sh`
    first. Audit rows are plain SQL, not `logAudit` (#48).
    Traps met: (i) a test that makes the PO with the SAME user as organizer and finisher (the existing Finish Buying
    fixtures do) can never see this bug; the fixture needs two users. (ii) A mutation survived the first tests: removing
    `po.created_by <> r.organizer_id` from the plan changed nothing because the finisher guard alone excluded the PO, since
    in my fixtures the organizer was never also the finisher. The common real case, an organizer who finished their own
    buying, needed its own test (it would otherwise list a no-op and make the guarded UPDATE count differ). (iii) Cleanup of
    a test that makes attachments: `po_line_purchases.receipt_attachment_id` points AT `document_attachments` (#21), so the
    purchases of EVERY test company go before any attachment, and cleanup finds its companies by name prefix so a run that
    died half way cannot poison the next one (it did: 8 leftover companies after a few failed runs).
    Mutation-checked: 2 on the fork line (finisher again; no fallback) and 7 on the backfill, all killed. Tests:
    `services/gateway/tests/po-ownership-from-requisition.test.ts` (real Postgres, 14, two users through the real
    requisition flow). Related to #23, #24, #21, #48.

67. **A legacy column still read by screens after the write path moved to another column, and a cost label that is
    copied to a second table and never follows.** Two screens said "Last Cost" and both were wrong, for different
    reasons. (1) The Products list showed `products.average_cost` (migration 008, `DEFAULT 0`). Only the old inventory
    import ever set it (`routes/inventory-import.ts` inserts it once and its upsert never updates it again); the one
    per-product Cost today is `products.standard_cost` with `cost_currency`, written only by `applyProductCostChange`
    with a trail in `product_cost_history`. So every product of Nishtimani Yakam and Al Watanyia (181) showed 0, and
    Nishtimani Factory showed stale import numbers on 2,649 of 3,545 products (AC-008: 4.25 shown, real cost 4,500 IQD).
    Nothing errored: the column exists and is a valid number. (2) The product page's "Stock by Location" shows
    `stock_balances.average_cost` and `last_cost_currency`, which only a stock move changes (the trigger from migration
    283), so it is a copy of the product's cost taken when stock last moved. A Stock Adjustment cost correction that
    keeps the same number and changes only the currency (STEEL-018: 35 IQD to 35 USD on 26 Oct) updated the product and
    then hit `if (i.unit_cost === currentCost) return null` in `createStockAdjustment` (resolvers.ts), which compares
    the amount and ignores the currency, so the location kept saying 35 IQD. How to spot it: the same field name on two
    GraphQL types with different meanings (`Product.average_cost` is the legacy products column, `ProductBalance` /
    `StockBalance.average_cost` is the stock_balances one); a column that is 0 for some companies and plausible for
    another; `count(*) FILTER (WHERE p.average_cost > 0)` against the same for `standard_cost` per company; a cost
    history whose newest row disagrees with the location row.
    Production, read-only, 2026-11-09: of 979 Factory and 38 Yakam balance rows whose product has a cost currency, 765
    and 13 carry a different currency label, and 714 and 13 of those have exactly the same amount (the label is the
    only difference, "IQD" under a USD product); of the 548 such rows that hold stock, 507 were last set by an
    `opening_balance` move. `stock_balances.last_cost_currency` and `stock_moves.currency_code` both default to
    `'IQD'`, so legacy and backfilled rows were tagged IQD whatever the import's currency was.
    Fixed (1 of 3): the Products list reads `standard_cost` / `cost_currency`, a never-recorded cost (0) is a dash, and a
    cost without a currency keeps the "Currency not set" tag (`ProductsPage.test.tsx`, 4 mutations killed).
    Fixed (2 of 3): `createStockAdjustment` treats a currency change at the same amount as a correction. A location that
    holds stock gets the usual `cost_correction` move in the new currency; a location that holds nothing is re-tagged
    directly (a move needs qty > 0 and there is no value to restate; it used to THROW when the amount also differed, and
    the throw rolled back the product-level Cost change too); a currency counts only when one was actually given
    (explicit, or the product's own), so the IQD fallback cannot flip a location that is correctly tagged; a location
    with no balance row at all still throws. Tests in `stock-adjustment-cost-correction.test.ts` (5 new, 6 mutations
    killed).
    Fixed (3 of 3, data): `services/gateway/src/scripts/backfill-location-cost-currency.ts` (compiled by the gateway
    build, run on the VPS from `services/gateway` after sourcing `/opt/fnc-erp/.env`:
    `node dist/scripts/backfill-location-cost-currency.js [--company "<name or id>"]` is a dry run, `--apply
    --actor-email <admin>` writes). The rule comes from the user: the PRODUCT's currency is the corrected one, so a
    location tagged IQD under a product whose cost currency is USD, at exactly the same amount, becomes USD. Products
    that are IQD are genuinely IQD (the user has both kinds) and are never touched; a product with no currency has
    nothing to follow; rows whose amount differs (about 50 on production: 20,098 IQD under a 0.50 USD product, but also
    0.2405 under 0.24) are LISTED for a person and never changed; a product held in another company's location (11 rows
    at Yakam) and virtual locations are skipped. A row holding stock gets a `cost_correction` move (same location to
    itself, full quantity, same cost, USD), which keeps the append-only ledger in step; the balance's `last_move_at` is
    put back (a correction is not a physical movement, and transfer pricing ranks lots by it); an empty row is
    relabelled directly. One transaction, one `audit_log` row per row (old and new label, and how it was done), plain
    SQL for the audit rows (#48), then a re-read of the COMMITTED data on a second connection (label, quantity, amount,
    last movement). By the script's own rules on production (read-only SQL, 2026-11-09): 716 rows, 547 holding stock and
    169 empty, none lot-tracked or negative, 58 with a reservation (which a correction leaves alone); all in Nishtimani
    Factory except 2 empty ones at Yakam. Tests: `backfill-location-cost-currency.test.ts` (12, real Postgres, fixtures
    built with real stock moves; 13 mutations killed).
    Traps met: (a) a count taken before an exclusion was designed (727 rows) is not what the finished script acts on
    (716): rerun the real rule before quoting a number. (b) `psql` reads the apostrophe in an `\echo` as an unterminated
    quote and prints an error line while the queries still run, so a stray "unterminated quoted string" above a result
    is the echo, not the query. (c) `CREATE TEMP TABLE ... ON COMMIT DROP AS SELECT ... WHERE id = ANY($1)` takes a bound
    parameter, and keeps `last_move_at` exact where a JavaScript round trip could lose digits.
    Fixed (step 3, same day): the Stock Balances page and `stockBalanceSnapshot`. The page labelled every row's last cost
    and value `IQD` and added every row into one "Total Inventory Value" labelled IQD, although a location's last cost has
    its own currency (`stock_balances.last_cost_currency`) and nothing here is ever converted. Now every snapshot row
    carries `currency_code`, the snapshot returns `totals` (one figure per currency, summed in SQL, ordered by currency),
    and the page shows one value card per currency and each row in its own currency. `totalValue` / `currency` stay on the
    type only for a browser tab still open on the previous release and are now the IQD rows' total alone, labelled IQD
    (removing a field would break such a tab with a validation error). `currency_code` is nullable on purpose (#38: a
    non-null violation would null the whole snapshot). Tests: `stock-balance-snapshot-currency.test.ts` (9, through the
    real ApolloServer, 6 mutations killed) and the "currencies" block in `inventory.test.tsx` (4, 6 mutations killed).
    Found, NOT fixed: the Inventory Valuation Report query (`inventoryValuationReport`) does not work at all. Its SQL names
    the column `average_cost` but the mapper reads `row.avg_cost`, so every `avgCost` is NaN and GraphQL refuses it
    (`Float cannot represent non numeric value: NaN`, reproduced through the real schema against dev data, so any company
    with stock gets an error instead of a report). Behind that it hard-codes `'IQD'`, adds every currency into one
    `totalValue`, does not exclude virtual locations, returns `totalLocations: 0` / `lowStockItems: 0` /
    `byLocation: []` as literals (#34), and the page draws the headline total with `currency="USD"` while its rows say
    IQD. Fix the column first, then the currency the same way as the snapshot (a currency on every row, totals per
    currency). Nothing caught it because no test runs that query through the schema (#14, #38).
    Still open: `BOMForm.tsx` (`standard_cost: parseFloat(p.average_cost)`, so BOM cost planning starts from the legacy
    number) and `StoreOutPage.tsx` (the unit price prefill reads `prod.average_cost`) read the same legacy field through
    the same `PRODUCTS_QUERY`; 1,982 Factory products have no cost currency at all. Related to #43 (which "store price" a
    screen means), #56 (a copy that does not follow its source) and #34 (a report that looks empty while the data is fine).

68. **A printed document in a variable web font becomes Type 3 text cut into pieces at every space and hyphen, and a PDF
    program that re-flows it puts letters on top of each other.** The invoice number in the payment line of NY-INV-2026-0005
    ("Reference invoice number NY-INV-2026-0005 in your payment.") showed its "Y-I" overlapping, in a PDF saved from the
    Invoice page and opened in a PDF program (dotted boxes around the text blocks, the look of an editing viewer). It could
    not be reproduced on screen: the stored number is plain ASCII (checked on production, all 14 invoice numbers), the page
    rendered cleanly in Chrome and Edge at 100, 125 and 150 % display scaling and at the zoom the public verification page
    uses, and the PDF was clean in Chrome's viewer and in MuPDF. What the PDF did show: `invoiceHtml.ts` loaded Inter from
    Google Fonts, which is a VARIABLE font, and Chrome wrote it as Type 3 fonts. The payment line was 32 separate text runs
    alternating between two Type 3 fonts at every space and punctuation mark (`NY` | `-` | `INV` | `-2026-0005`), one PDF
    held 29 to 98 Type 3 fonts, and two pages weighed 233 KB (59 KB with real fonts). A program that re-flows text places
    each run itself, and the seams between a letter and a hyphen have no space to hide an error in: `Y-I` is exactly such a
    place. That this is what the user's program does is inferred (the dotted boxes, the location of the overlap), not
    observed: the program was never named and could not be run here.
    Fix: STATIC Inter (latin and latin-ext, 400/500/600/700, woff2, from @fontsource/inter 5.0.19, SIL OFL, licence file
    included) in `apps/web/public/fonts`, declared by `lib/documentFonts.ts` (`INTER_FONT_FACES`) and used by
    `buildInvoiceHTML` instead of the Google `@import`. It is the same Inter: page breaks were identical for 1 to 30 rows,
    plain and letterhead (10 cases) and a line's width differed by under 1.4 pt. Checked in headless Chrome with the real
    code behind a server serving `public/` the way nginx does: the `srcDoc` preview iframe loads the fonts from the
    root-relative path (200), nothing is requested from Google, and the printed PDF has 0 Type 3 fonts (real Inter Regular,
    SemiBold, Bold and a latin-ext Inter Regular), the payment line is one run, and Kurdish letters (Ş ş û ê ç) are in one
    run too. Production serves the app from `/opt/fnc-erp/apps/web/dist` with `try_files $uri /index.html` and no CSP, so
    `/fonts/` is served from `dist/fonts` (Vite copies `public/`); after a deploy check
    `curl -I https://erp.npbsco.com/fonts/inter-latin-400-normal.woff2` answers 200 `font/woff2` (a missing file would
    return index.html with 200 and the page would quietly fall back to Arial).
    How to spot it: `page.get_fonts()` in PyMuPDF lists `Type3`; text extraction returns dozens of spans for one line; a
    two-page document of plain text is hundreds of KB; copy and paste from the PDF comes out wrong. Any Chrome-printed
    page that uses a Google variable font does it, not only Inter.
    NOT done, same cause: the other six document builders still import Google's variable Inter, so their PDFs are Type 3
    too (`expenseClaimHtml.ts`, `poHtml.ts`, `requisitionHtml.ts`, `storeInHtml.ts`, `storeOutHtml.ts`, `voucherHtml.ts`);
    the fix is one line each with the same `INTER_FONT_FACES`. The worker's `packages/pdf` templates have their own markup
    and no Inter import. Tests: `lib/__tests__/documentFonts.test.ts` (7, 6 mutations killed: the Google import back, the
    unicode ranges dropped, the wrong folder, a variable weight range, a subset left out, a font file missing).
    Related to #53, #54 (the invoice's print path) and #14 (a test cannot see how a PDF looks; the PDF was inspected).

69. **A new field on a line that several screens and renderers show: the unit of measure on invoice lines.** The request
    (a screenshot of the printed table) was a "Unit" column right after Qty with Ea, M, Lot, Roll, Set, Box. Before
    building: `project_invoice_lines` had no unit (migration 021), all 189 production lines (14 invoices) were typed by
    hand with no source record to take a unit from, and units elsewhere in the system are inconsistent free text (`po_lines`
    alone has 'pc', 'No.', 'EA', 'EA.', 'Nos', 'box', 'Box', 'L.S', 'LS' as separate values), so a free text box would have
    repeated that. The user chose (asked, not assumed): pick from a list or type your own, the list Ea, M, Lot, Roll, Set,
    Box, Kg, L, Pack, Pair, Day, existing lines left blank (a dash), new lines start as Ea.
    Design. Migration 318: `uom VARCHAR(20)`, nullable, `CHECK (uom IS NULL OR btrim(uom) <> '')`; NULL means "never set"
    (every older line, not guessed at). The server accepts any text up to 20 characters and has NO whitelist
    (`services/gateway/src/lib/invoiceUnit.ts`: trim, collapse inner spaces, empty becomes NULL, over 20 refused), so the
    web's list (`lib/invoiceUnits.ts`) is only a convenience and there is no second list to drift (#30). Units are checked
    before a document number is taken (`nextDocumentNumber` is a sequence, so a refusal after it would burn a number). On
    edit, a unit left out keeps the stored one, an empty one or null clears it. Readers: the shared `mapInvoiceLine`
    (`projectInvoice` and the re-fetch inside `updateProjectInvoice`) and the public verification route, which maps explicit
    fields (#55, #58). The public route's pinned list of line keys (`project-invoice-review-flags.test.ts`) failed when `uom`
    was added: that guard exists so an internal review field can never leak, and `uom` is a printed field, so the list was
    updated deliberately. Web: `UnitSelect` (a select with the list, a stored value that is not in the list kept as a
    choice, and "Other..." turning into a text box limited to 20), a Unit column in the create wizard and the edit screen and
    the on-screen lines table, `lib/invoiceLineInputs.ts` for the create mapping, a locale group `invoiceUnit` in both
    languages (every key used was checked to resolve in both, #26).
    The printed table. The unit goes in through `esc()` (#54; a hostile unit is tested). Adding a column cost the printed
    Description column width: at print width it fell from 157 px to 104 px (a four-line description), because the money
    columns were 140/140/150 px hints with wrapping allowed, far wider than their numbers. Fix: money cells are
    `white-space:nowrap` and the hints are 120/120/132, which gave Description 159 px for ordinary amounts (130 px only when an
    amount has seven digits, because nowrap makes the column fit its number). Page breaks were identical to the previous
    layout for 1 to 30 rows, plain and letterhead (10 cases, long descriptions). Measured in headless Chrome on the real HTML.
    Not changed: the worker's own invoice PDF template (`packages/pdf/src/templates/invoice.ts`, its own table and no Unit
    column; on production its 4 `PROJECT_INVOICE_PDF_REQUESTED` events all failed, so it is not in use) and the REST create
    route in the projects service (it builds lines from sources and leaves the unit NULL; every production line is manual).
    Traps met. (a) A test that asserts "the next invoice number is the previous plus one" proves nothing for a company
    with no `document_sequences` row: `nextDocumentNumber` then returns `INV-<milliseconds>-<random>`, and the assertion
    passed once and then failed every run. Give the test company a real sequence row. (b) My mutation script said KILLED for
    a mutation whose pattern matched nothing: the Bash heredoc had swallowed a backslash in the regex (`\s` became `s`), the
    code was unchanged, and the "kill" was that flaky test. Write scripts that contain regexes with the file tool, and
    treat a result as meaningful only when the script also reports that the pattern was found exactly once. (c) `eslint
    --fix` removed a type cast I needed for `.value` and left an error-typed return (use the generic form
    `getAllByLabelText<HTMLSelectElement | HTMLInputElement>(...)`); auto-fix is for new files only (#37). Tests:
    `services/gateway/tests/invoice-line-unit.test.ts` (18, real Postgres through ApolloServer and the public route, 9
    mutations killed), `lib/__tests__/{invoiceUnits,invoiceHtmlUnit,invoiceLineInputs}.test.ts`,
    `components/ui/__tests__/{UnitSelect,InvoiceBuilderUnit}.test.tsx`, `pages/projects/invoices/__tests__/InvoiceDetailUnit.test.tsx`
    (21 web mutations killed). Related to #55, #58, #54, #30 and #63 (the print layout).

70. **A list that keeps its filters in component state loses them on Back, and the product page's own Back button would
    have defeated a URL-only fix.** The report: filter Products by category, open a product, click Back, the filter is
    gone. `ProductsPage` held its five filters (search, category, store, Low Stock Only, Manufactured Only) in `useState`,
    and the page unmounts when a row is opened. The product page's Back is `<PageHeader backPath="/inventory/products">`,
    which calls `navigate(backPath)`: a fresh visit to the bare path with no query string, not a step back in history.
    Keeping the filters in the URL would therefore have fixed only the browser's Back button, which is why the fix follows
    the convention the Projects and Requisitions lists already use instead: `sessionStorage`, key `products-page-filters`,
    written on every change and read when the page opens. Read defensively: a category that is not one of the four is
    dropped, a store is kept only under Raw Material (it means nothing under another category), values of the wrong type
    are ignored, and corrupt or blocked storage (an accessor that throws) just starts with no filters. It lasts for the
    browser tab: closing the tab resets it, by the same rule as the other two lists. Tests: `ProductsPageFilters.test.tsx`
    (14) walks the real flow through a router (open a product, then the Back button and then the browser's back) for the
    category, the store, the search text and both toggles, plus a cleared filter being remembered as cleared and each of the
    defensive reads; 12 mutations killed.
    Audit, approximate (pages that render `<FilterBar>` and mention neither `sessionStorage` nor `useSearchParams`): 25 of
    28 keep nothing, among them Vendors, Employees, Users, Manufacturing Orders and Requests, Payment Vouchers, Leave
    Requests, Stock Balances, Accounts, Locations, the two interco lists and the reports. `useSearchParams` in Lots and
    Stock Moves may only READ incoming links, so those two are not confirmed to keep anything. NOT changed (the request was
    Products). The same ten lines now exist three times (Projects, Requisitions, Products): if more lists get this, move
    them into one hook rather than a fourth copy.
    Traps met in the test. `Select` with `options` is a searchable portal select, not a native `<select>`: open it by
    clicking what it currently shows and choose the option on `mouseDown` (#59), and a store name is also printed in a
    product row, so take the LAST text match and assert on which rows are shown instead of on ambiguous text. A "mutation
    killed" can be a compile error (`Tests  no tests`), so a result without a test count is not a kill. `eslint --fix`
    strips casts it thinks are unnecessary (#69); give the query a generic instead.

71. **Adding a "configurable" lifecycle phase means finding every place that still holds the list, the shortcut that
    jumps over it, and the message nobody sees.** The project lifecycle is company config (`lifecycle_phases`,
    migrations 166 / 175), so the stage bar picked up a new Financing step (between Execution and Closeout) from one
    migration row. Everything else that still knew "the six phases" did not: the new-company seed
    (`company-management.ts`), the admin override's valid list (`adminSetPhase`) and its dropdown, the web's fallback
    stage list, the project form's stepper (its index came from `status`, so Closeout would have shown as step 6 of 7),
    and the Settings sentence "The six phases are fixed". Found by grepping `closeout` across the repo, not by the
    feature itself. Same family as #30 (parallel lists drifting). Fix: one list on the gateway
    (`services/gateway/src/lib/projectLifecycle.ts`), and a test that parses the migrations and the new-company seed and
    fails when they disagree with it. The test must parse the SOURCES: `fnc_erp_test` has no `lifecycle_phases` rows at
    all (166 seeds only the companies that exist when it runs), so a test that reads the table checks nothing.
    The design itself: Financing is a PHASE, not a status. `projects.status` stays `approved` through it, so every
    existing check on an approved project (POs, costs, invoicing, the state machine) is untouched, and the move is
    phase-only like `advancePhase` for Scope Review to Bidding. Execution to Financing is `advancePhase('financing')`
    (End Execution, with a confirm bar); `completeProject` (Close Project) now demands phase `financing` and a settled
    invoice list. Three things this turned up:
    (a) *A shortcut that skips the new step.* `completeProject` went straight from Execution to Closeout, and a second
    path, the REST `POST /projects/:id/complete` in the projects service, closes a project without ever setting a phase.
    Gating only the GraphQL one would have left the rule bypassable, so the invoice rule is one function in
    `packages/db/src/projectCloseout.ts` used by both (the REST route does not use phases, so only the invoice rule
    applies there). Grep every writer of `status='completed'`.
    (b) *A refusal the user never sees.* The status bar's `executeBtn` had no catch and the Apollo error link toasts
    nothing for GraphQL errors, so the new, clear server messages ("1 invoice is not fully paid yet (1 issued, unpaid)")
    would have been an unhandled rejection and a button that seemed dead. Every status-bar button now toasts the
    server's message. How to spot it: a mutation call with no `.catch` / `try` and no `onError`.
    (c) *A hint that depends on which tab you visited.* The invoices query was `skip`ped unless the Contract Management
    tab was open, so the Close Project button would only have learned about unpaid invoices after a visit there. It loads
    in the Financing phase whatever tab is open; the server stays the authority and the web mirror
    (`lib/projectFinancing.ts`) is pinned to the server file by a test (#58 pattern).
    Rule chosen on purpose (#33): an allow-list of what SETTLES an invoice (`paid`, or `cancelled` / `void` which are not
    invoices), so a status added to `project_invoices_status_check` later blocks the close by default instead of letting
    it through; a test fails until a new status is classified. The unknown-status safeguard could only be tested through a
    pure function (`summariseInvoiceStatusCounts`) because the CHECK constraint refuses to store an unknown status: the
    first version of the test fed the blocker a hand-built state and the mutation that put the deny-list back SURVIVED.
    Who may end execution and close out: the project's own manager (`project_manager_id`, an employee linked to the user)
    OR a `projects.approve` holder (admins pass); one function, `callerCanCloseOutProjectGW`. A manager who lacks
    `projects.approve` can now close their own project (before, `completeProject` needed the permission); the user asked
    for this. A project with no invoices (or only cancelled / void ones) can be closed only by an administrator
    (system / company admin or a projects module admin); an unpaid invoice blocks everyone. The Admin Override panel
    (`adminSetPhase`) is untouched and can still move a project to any phase.
    Tooling traps met. (i) `node -e` through Bash and a `String.replace` patch of a script both mangled a regex / newline
    (#69): write scripts with the file tool. (ii) A mutation pattern that matches twice is skipped, not killed: the admin
    expression existed in two places, so the pattern needed its neighbouring line. (iii) The projects service creates an
    analytic account coded `PRJ-` + the project code in a `varchar(20)`, so a test project code over 16 characters
    returns a bare 500. (iv) `eslint --fix` on new files only (#37).
    Tests: `services/gateway/tests/project-financing-phase.test.ts` (real Postgres and the real ApolloServer, 30; 13
    mutations killed), `services/projects/tests/project-close-invoices.test.ts` (REST, 3; mutation-checked),
    `apps/web/src/components/projects/__tests__/ProjectStatusBar.test.tsx` (10) and `lib/__tests__/projectFinancing.test.ts`
    (8) (10 mutations killed). Not covered by an automated test: `ProjectDetail`'s wiring of the gate (no page harness for
    a 36k-line file) and the screens in a browser. Related to #30, #33, #58, #12.

72. **Removing a form field can orphan the control that served it, and a number to calculate from may be a field nobody
    fills.** The request: take Budget Amount off the new-RFQ and edit-project forms and put withholding tax (WHT) there,
    "calculated from the Bid Price". Three things were hiding behind it.
    (a) *The Currency selector served the removed field.* The form's one Currency box sent only `budgetCurrency`;
    `projectValueCurrency` was never sent, so `createRFQ` stored the Bid Price's currency as `'IQD'`
    (`i.projectValueCurrency ?? 'IQD'`) whatever was picked (production: the one project with a Bid Price is labelled IQD
    beside a USD budget). With the Budget gone the selector would have labelled nothing, and a tax amount has to carry a
    currency. Fix: the form sends both currencies from the one selector. Same family as #65(b) (a hard-coded `'IQD'`
    label). Visible side effect, deliberate: the cost summary's `grossMargin` is shown only when a currency equals
    `projectValueCurrency`, so a USD project now gets a margin it never had. Spot it: for any field you remove, grep what
    else its inputs fed (here `currencyCode` also set `budget_currency`, the header's display currency).
    (b) *Production data decided the base.* "Bid Price" is three different things here: `projects.project_value` (typed on
    the form, labelled "Bid Price (Project Value)"), the Bidding tab's computed price (`bid_commercial_summary` and
    `project_bid_revisions`) and `rfq_lines.bid_unit_price`. Read-only SELECTs on production (152 projects) showed 1
    project with a typed Bid Price, 0 with a bid summary or revision, 0 priced RFQ lines, 20 contracts, and 1 project
    with a Budget Amount (so removing it breaks almost nothing, and nothing else sets the budget afterwards). The tax
    therefore calculates from the typed field, shows no amount (null, not 0) until one is typed, and says so on the form.
    Check what people actually fill in before choosing the number a calculation hangs on.
    (c) *Store the settings, calculate the figure.* Migration 320 adds `projects.wht_applies`, `wht_scenario`, `wht_rate`
    (same shape and CHECK as `project_invoices`, migration 063; a table CHECK `projects_wht_consistent` also keeps
    "applies needs a scenario, off means no scenario and a zero rate" true whatever writes the row). The amount is
    `project_value x wht_rate`, rounded to four decimals like an invoice, computed in `projectRowToGQL` on every read;
    storing it would go stale the moment the Bid Price changed (#56). `project_value` is `NUMERIC(.,2)`, so the tax is
    worked out from the stored two-decimal price (a test typed 1234.5678 and expected 40.7407, the stored 1234.57 gives
    40.7408). The GraphQL fields are all nullable (#38). Settings change only when the update input mentions them: the
    status bar's schedule update sends none of the three, and a `COALESCE` per column cannot clear a scenario, so the
    UPDATE uses `CASE WHEN $27::boolean` with every parameter cast (#57 trap (a)). Validation runs BEFORE the project
    number is taken or the analytic account is made, and an unknown scenario or an out-of-range rate is refused with a
    message, never quietly replaced (#30). A rate may have at most two decimals of a percent; the form and the server
    both refuse more instead of rounding what the person typed.
    Kept on purpose: the API still accepts `budgetAmount` (an old browser tab keeps working), an edit that omits it keeps
    the stored budget (`COALESCE`), and `EditProjectDrawer` (a second Budget field, imported nowhere) was deleted with its
    30 `proj.edit.*` strings. Invoices are untouched: their WHT is still typed per invoice (the wizard starts at 3%, as the
    project form does, and ignores the company default `system_configuration.default_wht_rate`, also 3% everywhere).
    Tooling traps met. (i) A mock whose `useQuery` returns a fresh `data` object each call loops a component whose effect
    depends on it until the worker runs out of memory; the run then HANGS instead of failing (#60.3): hand back one
    object, run vitest with `timeout` and output to a file, and stop the leftover node processes. (ii) A test that calls
    `createRFQ` needs the company's `project` and `rfq` document sequences (`deriveRfqNumber` reads `.rows[0].prefix` and
    throws a bare TypeError without them); the test adds and removes them, and removes the analytic accounts
    `createProject` makes, or the next run collides on the same code. (iii) The shell patch trap again (#69): write
    scripts that hold regexes or newlines with the file tool.
    Tests: `services/gateway/tests/project-withholding-tax.test.ts` (real Postgres through the real ApolloServer, 26; 13
    mutations killed), `apps/web/src/pages/projects/form/__tests__/ProjectForm.test.tsx` (14, drives the real form) and
    `lib/__tests__/projectWht.test.ts` (11, pins the scenario list and rounding to the server file) (16 mutations killed).
    Not covered by an automated test: the Overview's Withholding Tax row in `ProjectDetail` (no page harness) and the
    screens in a browser. Related to #30, #38, #56, #65, #71.

73. **A "catch-all" branch in a type-to-label mapping, and a sibling screen on a different permission key.** The
    Bidding tab's file areas were two: Technical and Commercial, stored as `document_attachments` of entity type
    `bid_package_technical` / `bid_package_commercial` (migration 171). `bidPackageFileList` mapped the stored type
    back to the name the page uses with `entity_type === 'bid_package_technical' ? 'technical' : 'commercial'`, and
    the upload and delete resolvers each repeated the pair. Adding Cost Analysis and Clarifications (migration 321)
    through that code would have labelled both as Commercial, with no error, and the page, which files by that
    label, would have shown a Cost Analysis upload under Commercial. Fix: one map
    (`services/gateway/src/lib/bidPackages.ts`: entity type, label and whether the API hides it from a technical
    member, per area) used by all three resolvers, with a lookup that THROWS on an unknown type
    (`bidTypeFromEntityType`) and an upload that refuses an unknown `bidType` with a message naming the allowed ones.
    How to spot it: a two-value ternary or `else` that decides what a stored value means; adding a third value is
    where it breaks. Grep the resolvers for `=== '...' ? '...' : '...'` on a type column before adding a value.
    The same change turned up four more things:
    (a) *The old Clarifications Bid was a different feature on a different permission key.* It was the Technical
    Queries screen (`project_tqs`, ~1,000 lines of UI, ten GraphQL operations) gated by `projects.qaqc.*`, while the
    two sub-tabs beside it used `projects.bidding.*`. A user could open the Bidding tab and get a permission error
    inside one of its sub-tabs. Spot it: compare the permission key each sub-tab's queries and mutations ask for with
    the key the tab itself needs. Before removing the screen, production was read: 0 TQs and 0 TQ attachments, so
    nothing was lost; the table `project_tqs` and the `tq` value of the entity-type CHECK were KEPT (empty), so a
    code-only rollback still works (#39). Removing a feature also means removing its entry in the project Attachments
    registry (`lib/projectFiles.ts`) and its label under `proj.detail.fileSource`, and re-running codegen.
    (b) *A new Attachments source needs a label in both languages, and nothing fails without it.* The Attachments tab
    prints `proj.detail.fileSource.<source>`; a source with no label shows the raw dotted key. I had added the two
    sources to the registry and the page and only found the missing labels by asking what else reads the registry.
    `lib/__tests__/projectFileSourceLabels.test.ts` now reads every source key out of the gateway file and fails
    for a source with no label, or a label for a source that is gone, in en and ar (#26, #51).
    (c) *The page hid Commercial from technical-only team members; the API never did.* `bidPackageFiles` has always
    returned Commercial files to anyone holding `projects.bidding.view`, and the upload notice goes to every team
    member with the file name. Cost Analysis is pricing material, so it is enforced on the server for the list, the
    upload (and the list it returns) and the delete, with the same rule as the Attachments tab
    (`canSeeProjectCommercialFilesGW`). Commercial was first left as it was (narrowing it is the user's call) and was
    closed the same day on the user's instruction ("fix the API"): it narrows only what a technical member can fetch by
    calling the API directly, nothing the page showed them. One flag per area in `lib/bidPackages.ts`
    (`apiHiddenFromTechnicalMembers`), pinned equal to the page's list by `bidPackageTabs.test.ts`. A delete a
    technical member is not allowed returns `true` and matches nothing: the test reads the row afterwards instead of
    trusting the result. Still open, by the user's choice or out of scope: the upload notification naming a Cost
    Analysis or Commercial file to technical members (user: keep as it is), and the Commercial BUILDER queries
    (`bidCostItems`, `bidSupplierQuotations`, `bidCommercialSummary` and their mutations), which still need only
    `projects.bidding.view`; they feed the full (non-simple) bid mode, which all three companies have switched off.
    (d) *Tooling.* jsdom's `File` has no `arrayBuffer()`, which the real upload code calls, so every upload test
    failed at first, Technical included, which looked like a regression in code that had not changed; give the test
    file one. The Bidding tab had no render test at all (a 36k-line file with no harness); `BiddingTab` is now
    exported for tests, like `AttachmentsTab`, and rendered with its props. A scan of ProjectDetail's translation keys
    against the locales showed 21 keys already missing before this change (the list in #51 plus `directCostTotal2`,
    `raisedBy2`, `drawing3`, `spec`, `location`, `inspector2`, `attendees2`, `acknowledged2`, `resp`,
    `totalWorkforceToday`, `totalCriticalCompleteInProgress`, `activitiesDependencies`, `submittedValue`,
    `isCurrentlyWorkingOnThisVo`, `workPkg`); to tell yours from older ones, run the same scan on the pre-change
    source against the locale files at `git HEAD` and compare. All 21 were then added on the user's instruction: the
    English is what stood in the JSX before the conversion (`git show 760645f -- ProjectDetail.tsx`, the removed `-`
    lines), with `<0>` where the page puts a `<strong>` / `<span>` and `{{name}}` equal to the `values` it passes; the
    Arabic is mine and reuses the file's own terms. `i18n/__tests__/projectDetailKeys.test.ts` now reads every literal
    `t('...')` and `i18nKey` out of ProjectDetail.tsx and fails for any key missing in en or ar, and checks each of the
    21 has the same highlighted parts in both languages (an Arabic string may drop a value, never add one).
    (e) *A phrase to type, translated, against a code constant that is not.* The as-built "Supersede" confirmation
    unlocks its button only when the input equals `requireConfirmPhrase` (`'SUPERSEDE'`, ProjectDetail.tsx), but the
    instruction and the placeholder showed `t('proj.detail.supersede2')`: in Arabic "استبدال". An Arabic user was told
    to type a word the code would never accept, so the destructive action could not be confirmed (same trap as #25a,
    found while writing the Arabic for "Type <0>…</0> to unlock the confirm button"). Both now show the constant itself,
    in both languages, and the unused `supersede2` key is gone. Spot it: a `requireConfirmPhrase`, or any `=== 'ENGLISH'`
    comparison, next to a text the user is told to type. The page has no harness for that modal, so the test pins the
    source lines (`projectDetailKeys.test.ts`); check it by eye in Arabic.
    Tests: `services/gateway/tests/bid-package-files.test.ts` (real Postgres through the real ApolloServer, 24: each
    area uploads, lists under its own name and deletes; the four kept apart; unknown type refused; another company's
    file and project; view-only, no permission, technical member, commercial member, PM, admin; the old TQ operations
    are gone from the schema), `project-files.test.ts` (the two new sources, the Cost Analysis visibility),
    `apps/web/src/pages/projects/detail/__tests__/BiddingTab.test.tsx` (24: the sub-tabs per viewer, each area's own
    files and heading, where a dropped file goes, any file type, delete and no-edit), `lib/__tests__/bidPackageTabs.test.ts`
    (pins the four kinds and the hidden ones to the gateway file), `projectFileSourceLabels.test.ts` and
    `i18n/__tests__/projectDetailKeys.test.ts`. 11 mutations on the gateway, 10 on the web and 6 on the translations,
    all killed (one survived at first: nothing pinned the placeholder of the phrase box). Related to #20 (the CHECK
    constraint), #24, #25, #29, #30, #51, #52.

74. **A line's currency guessed by a fallback chain on the screen, defaulted to IQD by three writers, and a form that
    cannot see what is stored.** NF-PO-2026-0163 (Nishtimani Factory, USD): the Order total read "24 IQD + 695.25 USD"
    while the Lines table printed that line as "24 USD". Line 3 ("Corner angle") was ADDED by an approved edit request on
    7 Nov. The requisition's edit form had no currency for an added line, so the payload carried none and the server
    filled in `?? 'IQD'` (`applyRequisitionEditChanges`; the PO side fell back to the company base currency). The totals
    group by `po_lines.currency_code` (IQD); the page printed `market_price_currency ?? requested_currency_code ??
    po.currency_code` and never looked at the stored column, so it showed the PO's USD. Nothing here was caused by the
    9 Nov backfills: they write `stock_moves`, `stock_balances` and `purchase_orders.created_by`, never `po_lines`, and
    this line was IQD two days before any of them ran (audit_log lists every backfill row; none points at it).
    Four separate faults, one symptom:
    (a) *The screen's fallback chain.* The Actual price, Unit price, Total and Initial price cells, the buying panel, the
    print and the Edit PO form all repeated the chain. Fix: one function, `poLineCurrency`
    (`apps/web/src/lib/poLineCurrency.ts`), stored currency first; the old columns only when the stored one was not
    loaded, and the page query now asks for `currency_code` (a test reads the query document, because the page tests mock
    Apollo and could not tell). The Market pricing form's default currency keeps the old chain on purpose: it answers "what
    should this be priced in", not "what is it stored in".
    (b) *A form that compares against the same wrong guess.* The Edit PO form started each line's currency from the chain
    and decided "did it change" by comparing to the chain, so a user setting line 3 to USD compared USD with USD and saved
    NOTHING, with no error ("I fixed it and it still shows the same"). A control and the check of whether it changed
    must read the stored value, not a display heuristic.
    (c) *A silent default for a new row's currency.* `resolveAddedLineCurrency` (`lib/poEditChanges.ts`): the currency
    the request names, else the one every existing line shares, else an error naming the currencies; never IQD. It runs
    at submission (the request itself then carries the currency and the Edit Request card shows it, and the person
    asking is refused, not the approver) and again at approval for requests already pending. The requisition edit form
    gained a currency box (starts on the shared currency, empty on a mixed requisition, submit waits for one). The two
    older creation paths (`createPurchaseOrder`, `createRequisition`) set only `requested_currency_code` and left the
    stored one at the column default; they now store it. An existing test (`po-edit-request-impact`) had a mixed
    IQD/USD PO adding a line with no currency and relied on the old fallback; it now names the currency like the form.
    (d) *Store In labelled every receipt IQD.* `confirmReceipt` and `completeStoreInLineForResolvedProduct` inserted
    `stock_moves` without `currency_code` (migration 258 had already said the column was dead), and booked the product's
    cost against the BASE currency whatever the line was in. The cost written is `unit_price x fx_rate_to_base`, so only a
    converted line (rate other than 1) is really in the base currency; a G1 line (no rate) is in its own. Production, 8
    weeks to 11 Nov: 142 of 485 Store In moves were USD lines labelled IQD (the location's "last cost" copies that label,
    so receipts kept re-creating the kind of wrong Stock Balances currency the 9 Nov backfill relabelled once; most of
    those 716 rows came from opening balances, not receipts), and 37 product costs were
    recorded as IQD from USD lines (36 Factory, 1 Yakam). Reproduced through the real receipt flow before the fix: a USD
    product at 6.25 USD, receiving a 6.25 USD line, became 6.25 IQD. One function, `receiptCostCurrency`
    (`lib/receiptCost.ts`: base currency when converted, else the line's), used for the move, the product cost and, through
    `original.currency_code`, the reversal / repost helper. Consequence to know: with the correct currency a USD
    receipt that moves a USD product's price beyond the company tolerance now PARKS in Cost Change Approvals instead of
    silently flipping the product to IQD. How to spot it: a total and a row on one page in different currencies; a Store
    Out / balance labelled IQD under a USD product; `stock_moves.currency_code <> po_lines.currency_code` for
    `source_type='po_receipt'`; a request that "saves" and changes nothing (compare the payload with the form's initial value).
    What the data looked like (production, read-only, 11 Nov): 29 lines on 12 POs print a currency different from the stored
    one, in four families that need different answers, so none was bulk-changed. Stored IQD with no other hint on a USD PO
    (0163 line 3, 0102 lines 4 to 6, PO-2026-0011, 0014, 0015): the stored IQD is almost certainly the default and the PO's
    USD was the intent. Stored IQD but requested USD (0028, 0029, 0030, PO-2026-0008, all closed or payment pending, 0029
    with purchases recorded in IQD at prices like 5.625): the creator asked for USD, the column kept its default. Stored
    USD but a stale requested IQD (0041, 0046): the stored USD is right and the old chain printed the wrong one. 0095:
    stored IQD at 3,792 a unit with market and verified labels USD. After this change the table prints what is stored, so
    the first two families now LOOK wrong (they are, in the data); fixing the stored values, and what the journals of the
    closed ones posted, is a finance decision, not a code one.
    Tooling traps met. (1) `grep -c $'\r'` in Git Bash reports 0 on a CRLF file (it strips the CR before matching), so I
    called a CRLF file LF, wrote a mutation script with `\n` patterns and half of them matched nothing ("SKIPPED"):
    detect line endings with node (`text.includes('\r\n')`) and write patterns in the file's own ending; the Edit tool
    is ending-tolerant, a node swap is not. (2) A mutation SURVIVED because the assertion found "24 IQD" in the order
    summary box instead of the buying panel it meant: scope an assertion to the element it is about. (3) A mutation
    result of "pattern matched 2 times" is not a result: add a neighbouring line until it is unique. (4) The first run of
    the neighbouring suites in the same pass caught the fixture that relied on the old fallback; run the suites that
    share a function before calling it done.
    Not done, on purpose: the data (line 3 of 0163 and the other 28 lines; the 37 product costs; stock moves and location
    labels written since the 9 Nov backfill, 13 on 8 receipts at the time of writing, are covered by re-running
    `scripts/backfill-location-cost-currency.ts` after this is deployed, not before); the other `recordProductCostChange`
    call sites were not read for the same base-currency label; the requisition page's own lines table already read
    `line.currency_code` and was not changed. Tests: `lib/__tests__/poLineCurrency.test.ts`,
    `pages/procurement/__tests__/poLineCurrencyPage.test.tsx` (the table, the order total agreeing with it, the Edit PO
    form, the print, the query), the "added line" block in `RequisitionDetail.test.tsx`,
    `services/gateway/tests/added-line-currency.test.ts` (28, real Postgres, both documents, requests pending from before)
    and `store-in-currency.test.ts` (11, through the real receipt, reversal, admin correction and cataloguing paths); 33
    mutations, all killed. Related to #43 (a currency shown without conversion), #65 (a hard-coded IQD label), #67 (the
    location's currency label) and #23 (one thing, several code paths).

82. **A file that prints with the invoice: a dedicated attach path, sheets that sit above fixed print furniture, and a
    print button that must not outrun the file.** The request: "add an attachment (a picture or a PDF) that displays as
    the last page of the printed invoice, after the bank information". The user chose: exactly ONE attachment per invoice,
    changeable at ANY status (nothing locks after issue), and NOT on the public QR verification page. Everything else
    (JPG, PNG, PDF; 10 MB; at most 10 printed sheets; PDF pages drawn as pictures; letterhead not repeated; invoices
    without an attachment unchanged) was proposed and accepted. No migration: the file is a `document_attachments` row on
    the invoice (`project_invoice` was already allowed, migration 025), told apart from any other file attached to the
    invoice by its label `invoice_print_page`.
    (a) *Never the generic attach routes (#48, #20).* The gateway's `/files/attach` asks only that the caller is logged in,
    the projects service mount asks only for VIEW access, and `verifyAttachmentEntityOwnershipGW` answers `true` for
    `project_invoice`, so anyone could have put any file of the company, including another document's, on an invoice that
    prints for the client. `setInvoicePrintAttachment` / `removeInvoicePrintAttachment` (`resolvers.ts`) need
    `projects.invoices.edit`, lock the invoice row in the caller's company, lock the file row in the caller's company, and
    run `checkPrintAttachmentFile` (`services/gateway/src/lib/invoicePrintAttachment.ts`): JPG / PNG / PDF, at most 10 MB,
    status `uploaded` (confirmed and used by nothing, so a file id cannot be borrowed from elsewhere), uploaded by the caller,
    category `attachment`. A new file removes the old one in the same transaction; the audit row is plain SQL inside it
    (`logAudit` swallows errors, #48); the value returned is read AFTER the commit (#27). `ProjectInvoice.printAttachment`
    is a field resolver, so every reader of the invoice shape gets it (#23, #55), and it is NULLABLE so a failure cannot
    null the invoice (#38). The public route maps explicit fields and was never touched; a test fetches it with an
    attachment present and finds no filename, id or label.
    (b) *Fixed elements print on EVERY sheet, including these.* The letterhead (`.lh-bg`, z-index -1) and the stamp
    (`.lh-stamp`, z-index 10) are `position: fixed`, so Chrome repeats them on each printed sheet (#53). An attachment
    sheet would have carried the letterhead artwork and the stamp over the client's own document. The sheet is an opaque
    `position: relative; z-index: 20` block, 210 x 296 mm with a 2 mm white shadow below (296, not 297: a block as tall as
    the sheet prints an empty sheet after it, #53f, #63; the shadow covers the last millimetre of footer artwork). It is a
    SIBLING after the last `.page` and carries none of the classes the pagination script looks for (`.page`,
    `.page2-break`, `.page-footer-bar`, `.page-count`), so the script never sees it, the sheets always land after the
    pages the script inserts (it inserts with `insertBefore(newPage, currentPage.nextSibling)`), and "Page N of M" counts
    invoice pages only. The CSS and the markup exist ONLY when there are pages: `buildInvoiceHTML` with no attachment
    returns exactly the bytes it did before (compared with the committed version for 10 shapes x 3 absent forms). Every
    image source goes through `safeImageSrc` (#54), and a 14 MB data URL passes it quickly (the check is a linear character
    class, not a backtracking pattern). Known and left: the stamp's text ("AUTHORIZED BY") still sits in the PDF's text
    layer under the white sheet; nothing is visible.
    (c) *A PDF cannot be embedded in a printed page.* Chrome prints an iframe/embed PDF as a grey box. `lib/pdfToImages.ts`
    draws each page to a canvas (about 1654 px wide, JPEG 0.88) with pdfjs, so the text in the print is not selectable. Traps
    met: `destroy()` is on the pdfjs LOADING TASK, not on the document proxy (tsc caught it); pdfjs takes ownership of the
    bytes it is given (it transfers them to its worker), so the File itself is what gets uploaded, never those bytes; a JPEG
    has no alpha, so a page drawn on a clear canvas would print black where it is blank (fill white first); a PDF over the
    page limit is refused BEFORE any page is drawn. A picture is checked against its first bytes (a renamed file would
    otherwise print as a broken image icon). The page checks the file (type, size, "opens", page count) BEFORE uploading, and
    keeps the pages it just drew under the new file id so the preview does not download them again.
    (d) *Print must not outrun the file.* While the attachment loads, or when it could not be made (download failed, file
    unreadable, too many pages), the Print button is disabled with a reason, because an invoice that prints without the
    file someone attached looks finished and is wrong. The hook's answer belongs to a file id: after a replace, one render
    shows "loading", never the old file's pages (a test records every render). Only a failed DOWNLOAD offers Try again.
    The pages are built only while the PDF tab is open.
    (e) *Tests that could not see the bug until a second company existed.* The first 33 gateway tests killed 21 of 24
    mutations; the three survivors (the file's company scope on write, the file's and the invoice's on read) all needed an
    invoice of a SECOND company plus a file of the first, uploaded by the second company's user; with a single company the
    unscoped query returns the same row. A web mutation survived because the test file's type already equalled the one
    sent; a file with an EMPTY type (what a PC with no program registered for the extension reports) is what distinguishes
    them. How to spot it: a scoped query whose mutation "removed the company filter" and nothing failed.
    (f) *Verified in real Chrome, because layout is invisible to unit tests.* A bundle of the real `buildInvoiceHTML` and the
    real `renderPdfPages` (esbuild, served locally with the fonts and the pdfjs worker) printed to PDF in headless Chrome 157
    for letterhead and plain layouts x 1, 6, 12, 30 rows x no attachment / PNG / landscape JPEG / 1-page PDF / 3-page PDF
    (40 cases), analysed with PyMuPDF: page count = pages without the attachment + one sheet per picture; the invoice pages'
    text is identical with and without; no navy (letterhead) or magenta (stamp) pixel on an attachment sheet; the picture
    sits inside a 12 mm margin; no blank sheet; "Page N of M" unchanged. The real pdfjs path gave 1 / 3 pictures for 1 / 3 page
    PDFs, refused a 12-page PDF with both numbers, and refused a broken PDF. Harness traps: a Windows path with backslashes
    written into a generated TS import string loses its backslashes (convert to `/`); `page.setContent` keeps the origin of
    the page it replaces, so go to the local server first or `/fonts/...` does not load; `ActionButton` with `loading`
    changes its accessible name, so find a busy button by its text.
    NOT verified: the panel and the preview in the running app (layout, Arabic, a phone), and the print from the user's own
    browser. Not done on purpose: more than one attachment, downscaling a large photo (a 10 MB JPEG is about 13 MB inside the
    page), the worker's own invoice PDF template (`packages/pdf`, not in use), attachments on the public QR page. Existing
    behaviour seen on the way, not changed: the PLAIN (no letterhead) layout prints a 1-row wire-transfer invoice with
    intermediary bank details on two sheets.
    Tests: `services/gateway/tests/invoice-print-attachment.test.ts` (real Postgres through the real ApolloServer and the
    public route, 33; 24 mutations killed), `apps/web` `lib/__tests__/{invoicePrintAttachment,invoiceHtmlAttachment,
    pdfToImages,loadPrintAttachment}.test.ts`, `hooks/__tests__/usePrintAttachmentPages.test.tsx`,
    `components/projects/__tests__/InvoiceAttachmentPanel.test.tsx` and
    `pages/projects/invoices/__tests__/InvoiceDetailPrintAttachment.test.tsx` (100; 62 mutations killed). Related to #48, #20,
    #53, #54, #55, #58, #63 and #38.
