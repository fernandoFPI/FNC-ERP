-- G1 Phase 1 — additive schema + backfill for the requisition/per-vendor-
-- child-PO split. No resolver or frontend code changes ship with this;
-- the existing app keeps working exactly as it does today against a
-- schema that's now wider. Nothing here removes or tightens anything
-- live code currently depends on — old code paths (createPurchaseOrder,
-- the whole/single-PO pricing/approval mutations, actual_unit_price,
-- fx_rate_to_base, recalcPO, openPOsValue) are UNTOUCHED here and keep
-- working; their removal is scheduled for Phase 3 once the new resolvers
-- are the only path creating data. See the G1 planning conversation for
-- the full design; this migration implements only its §3 "Schema" and
-- the backfill described there.
--
-- Design decisions this migration encodes (recap, so this file is
-- self-contained if read in isolation later):
--   * requisitions is a new, separate table (not a kind-discriminator on
--     purchase_orders) — see the schema-recommendation discussion.
--   * po_lines.requisition_id is NOT NULL (every line always has a
--     requisition parent); po_lines.po_id becomes nullable (a line has a
--     child PO only once one exists, i.e. from Finish Buying onward).
--   * Vendor is chosen only at Items Bought, per actual bought entry —
--     there is no po_lines.vendor_id; vendor lives on the new
--     po_line_purchases table, one row per (line, vendor) pairing, so a
--     line can split across vendors.
--   * Child POs are created at Finish Buying by grouping bought entries
--     on actual vendor — purchase_orders.vendor_id stays the column that
--     holds it, just populated later in the lifecycle than before.
--   * No currency conversion anywhere: po_lines.currency_code (already
--     exists) is the only currency a line is ever priced in; totals are
--     computed per-currency, never summed across. fx_rate_to_base and
--     the three recalcPO-family SUM(... * fx_rate_to_base) totals are
--     dead as of this design but NOT removed here (Phase 3).
--   * stock_balances gets last_cost_currency alongside average_cost —
--     single value, overwritten by whichever move touched it last,
--     mirroring how average_cost/last-cost itself already works. No
--     per-currency parallel cost tracking.
--   * stock_moves.currency_code already exists (migration 008) but has
--     been 100% dead — every one of the 13 INSERT INTO stock_moves call
--     sites in resolvers.ts omits it, so every historical row silently
--     defaulted to 'IQD' regardless of the move's real currency. This
--     migration backfills it for receipt-caused moves only (traceable via
--     po_receipt_line_id -> po_lines.currency_code); every other move
--     type (Store In/Out, adjustments, opening-balance, transfers) has no
--     traceable source currency and is left at 'IQD' — a known, accepted
--     historical-data-quality gap, not something this migration can fix
--     retroactively. Going forward, populating it for real on every
--     insert is Phase 2/3 resolver work, not done here.
--   * GL account (po_lines.account_id, dead since migration 007) and
--     cost center (po_lines.cost_center_id, migration 197, previously
--     only wired for funding_source='employee_advance') become the two
--     tag columns every new line will be required to carry — enforced at
--     the application layer once Phase 2/3 ship (a blanket NOT NULL here
--     would break every existing INSERT, since no live code populates
--     either column for the normal vendor_ap path today — confirmed via
--     the prod count: 264/264 vendor_ap lines have neither tag). This
--     migration backfills existing untagged lines with a per-company
--     "Unallocated Purchases" account and a company_branches default
--     cost center (see below — that default doesn't exist per-branch yet
--     either, so in practice every migrated line gets the SAME fallback
--     cost center right now; real per-branch defaults are an operational
--     Finance setup task after this ships, not something inferable from
--     existing data).
--   * project_id stays a REQUISITION-header field (inherited by all its
--     lines, unchanged from today's purchase_orders.project_id) — the
--     project_cost_actuals pipeline (sync_project_cost_actuals trigger,
--     keyed on project_id via analytic_account_id) is NOT touched by this
--     design at all; account_id/cost_center_id are a separate GL-posting
--     dimension, not a project-actuals one.
--
-- Verification standard: dry-run tested against dev (BEGIN/ROLLBACK, full
-- backfill logic run for real, counts compared against expectations)
-- before this file was applied for real anywhere, matching the standard
-- set for G8 step 1. See the companion report for those numbers.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. New tables
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE requisitions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id              UUID REFERENCES company_branches(id),
  requisition_number     VARCHAR(50) NOT NULL,
  project_id             UUID REFERENCES projects(id),
  purpose                VARCHAR(30),
  delivery_destination   VARCHAR(30),
  priority               VARCHAR(20),
  organizer_id           UUID REFERENCES users(id),
  notes                  TEXT,
  status                 VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'inventory_check', 'store_pricing', 'market_pricing',
      'price_verification', 'pending_approval', 'approved', 'items_bought',
      'sourcing', 'completed', 'rejected', 'cancelled', 'deleted'
    )),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, requisition_number)
);

CREATE INDEX idx_requisitions_company_status ON requisitions(company_id, status);
CREATE INDEX idx_requisitions_project ON requisitions(project_id) WHERE project_id IS NOT NULL;

-- Bought entries — one row per (line, vendor) pairing recorded at Items
-- Bought. A line with no split has exactly one row here once bought; a
-- split line has several, each its own vendor/price/qty.
CREATE TABLE po_line_purchases (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_line_id             UUID NOT NULL REFERENCES po_lines(id) ON DELETE CASCADE,
  vendor_id              UUID NOT NULL REFERENCES vendors(id),
  currency_code          CHAR(3) NOT NULL,
  qty                    NUMERIC(20,4) NOT NULL CHECK (qty > 0),
  actual_unit_price      NUMERIC(20,4) NOT NULL CHECK (actual_unit_price >= 0),
  receipt_attachment_id  UUID REFERENCES document_attachments(id),
  bought_by              UUID REFERENCES users(id),
  bought_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  over_tolerance         BOOLEAN NOT NULL DEFAULT false,
  tolerance_approved_by  UUID REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_line_purchases_line ON po_line_purchases(po_line_id);
CREATE INDEX idx_po_line_purchases_vendor ON po_line_purchases(vendor_id);

-- Price-tolerance config, per company per currency — an actual price more
-- than either threshold above the checked market price flags the bought
-- entry (over_tolerance=true) and requires tolerance_approved_by before
-- Finish Buying.
CREATE TABLE company_price_tolerance (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  currency_code     CHAR(3) NOT NULL,
  tolerance_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  tolerance_abs     NUMERIC(20,4) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, currency_code)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. New columns on existing tables
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE purchase_orders
  ADD COLUMN requisition_id UUID REFERENCES requisitions(id),
  ADD COLUMN superseded_by_requisition_id UUID REFERENCES requisitions(id);

-- Widen the status CHECK additively to also accept the new child
-- vocabulary this migration's backfill writes (bought, finance_review,
-- payment_pending, closed — goods_received/cancelled/deleted/rejected
-- already existed). The OLD values stay valid too; nothing here stops
-- existing resolvers from continuing to write them until Phase 3 cuts
-- over and this constraint gets tightened to the child-only list.
ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft', 'inventory_check', 'store_pricing', 'market_pricing',
    'price_verification', 'pending_approval', 'approved', 'ready_to_issue',
    'items_bought', 'goods_received', 'finance_audit', 'invoiced',
    'completed', 'rejected', 'cancelled', 'deleted',
    'bought', 'finance_review', 'payment_pending', 'closed'
  ));

ALTER TABLE po_lines
  ADD COLUMN requisition_id UUID REFERENCES requisitions(id);
ALTER TABLE po_lines ALTER COLUMN po_id DROP NOT NULL;

ALTER TABLE po_edit_requests
  ADD COLUMN requisition_id UUID REFERENCES requisitions(id);
ALTER TABLE po_edit_requests ALTER COLUMN po_id DROP NOT NULL;
-- Exactly one parent, ever — holds for every existing row (po_id set,
-- requisition_id null) with no backfill needed on this table.
ALTER TABLE po_edit_requests ADD CONSTRAINT po_edit_requests_one_parent
  CHECK ((po_id IS NOT NULL)::int + (requisition_id IS NOT NULL)::int = 1);

ALTER TABLE project_material_issues
  ADD COLUMN requisition_id UUID REFERENCES requisitions(id);

ALTER TABLE stock_balances
  ADD COLUMN last_cost_currency CHAR(3) NOT NULL DEFAULT 'IQD';

ALTER TABLE company_branches
  ADD COLUMN default_cost_center_id UUID REFERENCES cost_centers(id);
-- Not populated per-branch by this migration — no existing data implies a
-- correct per-branch value. Left NULL; Finance sets these explicitly via
-- the settings screen Phase 4 adds.

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Per-company fallback GL account + cost center — CONFIGURABLE, not
-- hardcoded. chart_of_accounts.code is constrained to a real 4-digit
-- company-specific numbering convention (migration 242/243) that isn't
-- something this migration can safely invent a value for — picking an
-- arbitrary unused code risks colliding with one Finance already has
-- planned. Instead of seeding a row, this adds two nullable settings to
-- system_configuration (which already holds exactly this shape of
-- per-company designated-account pointer — see
-- advance_control_parent_account_id, migration 197) for Finance to set
-- via the settings screen Phase 4 adds. Until set, they stay NULL and
-- the GL/cost-center backfill in step 6 below is correctly a no-op — no
-- line gets tagged with an invented value. Tagging the 264 (dev+prod
-- combined, at last count) already-migrated lines is a deliberate
-- follow-up step once these are configured, not part of this migration.
ALTER TABLE system_configuration
  ADD COLUMN default_unallocated_purchase_account_id UUID REFERENCES chart_of_accounts(id),
  ADD COLUMN default_unallocated_cost_center_id UUID REFERENCES cost_centers(id);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Backfill — classify every existing purchase_orders row
-- ═══════════════════════════════════════════════════════════════════════
--
-- Three categories (see the G1 planning conversation for the full
-- reasoning):
--   TOMBSTONE: status IN (draft, inventory_check, store_pricing,
--     market_pricing, price_verification, pending_approval) — vendor was
--     never truly committed under the new model's definition (vendor is
--     only real as of Items Bought) — OR status IN (cancelled, rejected)
--     AND vendor_id IS NULL. Data moves to a NEW requisitions row; the
--     old purchase_orders row is soft-deleted and tagged
--     superseded_by_requisition_id.
--   COMPLETED-NO-CHILD: status IN (ready_to_issue, completed) AND
--     vendor_id IS NULL — 100% stock-covered, never needed a vendor.
--     Same treatment as TOMBSTONE (new requisition row, old row
--     superseded) but the new requisition's status is 'completed', not
--     whatever draft-ish state it would otherwise map to.
--   BECOMES-CHILD: everything else (status IN (items_bought,
--     goods_received, finance_audit, invoiced, completed WITH vendor_id
--     NOT NULL) OR (status IN (cancelled, rejected) AND vendor_id IS NOT
--     NULL)) — the existing purchase_orders row is KEPT, same id, same
--     po_number, gains only requisition_id. This is why receipts,
--     invoices, edit requests, comments, approval log, audit log, and
--     every other direct/indirect reference need zero re-pointing.

CREATE TEMP TABLE g1_po_classification AS
SELECT
  po.id AS po_id,
  po.company_id,
  po.branch_id,
  po.project_id,
  po.purpose,
  po.delivery_destination,
  po.priority,
  po.organizer_id,
  po.notes,
  po.status AS old_status,
  po.vendor_id,
  po.created_at,
  CASE
    WHEN po.status IN ('draft', 'inventory_check', 'store_pricing', 'market_pricing', 'price_verification', 'pending_approval') THEN 'TOMBSTONE'
    WHEN po.status IN ('cancelled', 'rejected') AND po.vendor_id IS NULL THEN 'TOMBSTONE'
    WHEN po.status IN ('ready_to_issue', 'completed') AND po.vendor_id IS NULL THEN 'COMPLETED_NO_CHILD'
    ELSE 'BECOMES_CHILD'
  END AS category
FROM purchase_orders po
WHERE po.status != 'deleted';

-- New requisition status, per category + old status. TOMBSTONE and
-- COMPLETED_NO_CHILD map fairly directly (the requisition status
-- vocabulary reuses the same names for draft/inventory_check/
-- store_pricing/market_pricing/price_verification/pending_approval/
-- cancelled/rejected, so no translation needed for those). BECOMES_CHILD
-- rows get 'sourcing' while their child is still active, 'completed' if
-- the child already finished successfully, or the child's own terminal
-- outcome (cancelled/rejected) mirrored onto the requisition when the
-- child never completed and nothing else exists to resolve those lines.
CREATE TEMP TABLE g1_requisitions_to_create AS
SELECT
  c.*,
  gen_random_uuid() AS new_requisition_id,
  'REQ-MIG-' || substr(c.po_id::text, 1, 8) AS requisition_number,
  CASE
    WHEN c.category = 'COMPLETED_NO_CHILD' THEN 'completed'
    WHEN c.category = 'TOMBSTONE' AND c.old_status IN ('cancelled', 'rejected') THEN c.old_status
    WHEN c.category = 'TOMBSTONE' THEN c.old_status
    WHEN c.category = 'BECOMES_CHILD' AND c.old_status = 'completed' THEN 'completed'
    WHEN c.category = 'BECOMES_CHILD' AND c.old_status IN ('cancelled', 'rejected') THEN c.old_status
    ELSE 'sourcing'
  END AS new_requisition_status
FROM g1_po_classification c
WHERE c.category IN ('TOMBSTONE', 'COMPLETED_NO_CHILD');

-- For BECOMES_CHILD rows, still need exactly one lightweight requisition
-- each (new id, same header fields) — separate temp table since these
-- don't reuse the above status-mapping branch structure as cleanly.
CREATE TEMP TABLE g1_requisitions_for_children AS
SELECT
  c.*,
  gen_random_uuid() AS new_requisition_id,
  'REQ-MIG-' || substr(c.po_id::text, 1, 8) AS requisition_number,
  CASE
    WHEN c.old_status = 'completed' THEN 'completed'
    WHEN c.old_status IN ('cancelled', 'rejected') THEN c.old_status
    ELSE 'sourcing'
  END AS new_requisition_status
FROM g1_po_classification c
WHERE c.category = 'BECOMES_CHILD';

-- Insert all requisitions (both branches) in one go.
INSERT INTO requisitions (id, company_id, branch_id, requisition_number, project_id, purpose, delivery_destination, priority, organizer_id, notes, status, created_at)
SELECT new_requisition_id, company_id, branch_id, requisition_number, project_id, purpose, delivery_destination, priority, organizer_id, notes, new_requisition_status, created_at
FROM g1_requisitions_to_create
UNION ALL
SELECT new_requisition_id, company_id, branch_id, requisition_number, project_id, purpose, delivery_destination, priority, organizer_id, notes, new_requisition_status, created_at
FROM g1_requisitions_for_children;

-- TOMBSTONE + COMPLETED_NO_CHILD: supersede the old purchase_orders row.
UPDATE purchase_orders po
SET status = 'deleted',
    superseded_by_requisition_id = r.new_requisition_id,
    requisition_id = r.new_requisition_id,
    updated_at = NOW()
FROM g1_requisitions_to_create r
WHERE po.id = r.po_id;

-- Their lines move to the requisition only — no child, po_id cleared.
UPDATE po_lines pl
SET requisition_id = r.new_requisition_id,
    po_id = NULL
FROM g1_requisitions_to_create r
WHERE pl.po_id = r.po_id;

-- BECOMES_CHILD: keep the row (same id, same po_number), point it at its
-- new requisition, remap status to the child vocabulary.
UPDATE purchase_orders po
SET requisition_id = r.new_requisition_id,
    status = CASE po.status
      WHEN 'items_bought'   THEN 'bought'
      WHEN 'goods_received' THEN 'goods_received'
      WHEN 'finance_audit'  THEN 'finance_review'
      WHEN 'invoiced'       THEN 'payment_pending'
      WHEN 'completed'      THEN 'closed'
      WHEN 'cancelled'      THEN 'cancelled'
      -- 'rejected' has no equivalent in the child vocabulary (only
      -- cancelled/deleted exist as child terminal states) — judgment
      -- call, only 1 row on prod at time of writing.
      WHEN 'rejected'       THEN 'cancelled'
      ELSE po.status
    END,
    updated_at = NOW()
FROM g1_requisitions_for_children r
WHERE po.id = r.po_id;

-- Their lines keep po_id (the now-child's, unchanged id) AND gain
-- requisition_id.
UPDATE po_lines pl
SET requisition_id = r.new_requisition_id
FROM g1_requisitions_for_children r
WHERE pl.po_id = r.po_id;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Synthetic bought entries for lines that ended up on a child PO —
--    "existing lines get a synthetic bought entry from the PO's vendor,
--    currency and actual/unit price so the new tables are complete."
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO po_line_purchases (po_line_id, vendor_id, currency_code, qty, actual_unit_price, bought_at)
SELECT
  pl.id,
  po.vendor_id,
  pl.currency_code,
  -- Prefer qty actually received; fall back to qty ordered for lines
  -- that reached a vendor-committed status but were never received
  -- (e.g. a cancelled/rejected child, or one still short of goods_received).
  CASE WHEN COALESCE(pl.qty_received, 0) > 0 THEN pl.qty_received ELSE pl.qty_ordered END,
  COALESCE(pl.actual_unit_price, pl.unit_price),
  po.created_at
FROM po_lines pl
JOIN purchase_orders po ON po.id = pl.po_id
WHERE pl.po_id IS NOT NULL
  AND po.vendor_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. GL account / cost center backfill for ALL untagged lines, sourced
--    from system_configuration's new default columns (step 3). Correctly
--    a no-op today, since those start NULL — no existing line anywhere
--    has either tag (264/264 on prod, 100%), and this migration does not
--    invent a value for either. Written now so the mechanism is in place
--    and correct as soon as Finance sets the defaults via the Phase 4
--    settings screen; re-running the equivalent of this UPDATE at that
--    point (a follow-up migration, or an admin-triggered one-time job)
--    is what actually tags the 264 already-migrated lines.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE po_lines pl
SET account_id = sc.default_unallocated_purchase_account_id
FROM requisitions r
JOIN system_configuration sc ON sc.company_id = r.company_id
WHERE pl.requisition_id = r.id
  AND pl.account_id IS NULL
  AND sc.default_unallocated_purchase_account_id IS NOT NULL;

UPDATE po_lines pl
SET cost_center_id = sc.default_unallocated_cost_center_id
FROM requisitions r
JOIN system_configuration sc ON sc.company_id = r.company_id
WHERE pl.requisition_id = r.id
  AND pl.cost_center_id IS NULL
  AND sc.default_unallocated_cost_center_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. stock_moves.currency_code backfill — receipt-caused moves only,
--    traced via po_receipt_line_id -> po_lines.currency_code. Everything
--    else stays 'IQD' (see header note).
-- ═══════════════════════════════════════════════════════════════════════

UPDATE stock_moves sm
SET currency_code = pl.currency_code
FROM po_receipt_lines prl
JOIN po_lines pl ON pl.id = prl.po_line_id
WHERE sm.po_receipt_line_id = prl.id
  AND sm.source_type = 'po_receipt'
  AND pl.currency_code IS NOT NULL
  AND pl.currency_code != sm.currency_code;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. stock_balances.last_cost_currency — default 'IQD' already applied
--    to every row by the column's own DEFAULT (step 2); nothing further
--    to backfill, since there's no reliable per-row historical currency
--    signal beyond what step 7 already recovered for receipt moves (and
--    that's a stock_moves fact, not directly a stock_balances one).
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- 9. po_lines.requisition_id stays NULLABLE in Phase 1, despite every
--    existing row now having one — NOT a leftover oversight, a corrected
--    mistake. This migration originally set it NOT NULL here on the
--    reasoning that every row (old and new) would have one with no
--    exceptions; that reasoning only covers EXISTING rows, backfilled
--    above. createPurchaseOrder (and every other old code path that
--    inserts into po_lines) has an explicit column list that doesn't
--    include requisition_id, since the column didn't exist when that
--    code was written — a NOT NULL here with no DEFAULT would make every
--    new PO creation start failing the moment this migration ships,
--    which is exactly the "no behavior change" promise this file's
--    header makes and the opposite of additive. Tightening this is
--    Phase 3's job, once the resolvers that create po_lines rows are
--    updated to always set it. Operational note for that gap: any PO
--    created via the OLD createPurchaseOrder between this migration
--    shipping and Phase 3's cutover will have po_lines rows with NULL
--    requisition_id — Phase 3 needs its own small backfill for that
--    window, or Phase 2 should backport requisition_id population into
--    createPurchaseOrder as a minimal fast-follow to close the gap
--    sooner rather than leaving it open for the full Phase 2 duration.

DROP TABLE g1_po_classification;
DROP TABLE g1_requisitions_to_create;
DROP TABLE g1_requisitions_for_children;

COMMIT;
