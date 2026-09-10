-- Read-only dry-run projection for migration 258 (G1 Phase 1) on prod.
-- Applies the migration's exact logic (copied verbatim, minus its own
-- BEGIN/COMMIT) inside one transaction, reports the same breakdown as
-- the G8 step 1 prod projection did, then rolls everything back. Nothing
-- persists — safe to run on prod as many times as needed. No ALTER
-- TABLE ... DISABLE TRIGGER involved this time (no trigger touches these
-- tables), so unlike the G8 projection this one takes no special lock —
-- ordinary row locks only, safe to run during working hours.
--
-- Usage: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/dry_run_g1_phase1_prod_projection.sql

\set ON_ERROR_STOP on
BEGIN;

-- (Schema changes below are the same ALTERs migration 258 makes — needed
-- so the backfill logic that follows has somewhere to write. All rolled
-- back at the end along with the data.)
CREATE TABLE requisitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL,
  branch_id UUID, requisition_number VARCHAR(50) NOT NULL, project_id UUID,
  purpose VARCHAR(30), delivery_destination VARCHAR(30), priority VARCHAR(20),
  organizer_id UUID, notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE purchase_orders ADD COLUMN requisition_id UUID, ADD COLUMN superseded_by_requisition_id UUID;
ALTER TABLE po_lines ADD COLUMN requisition_id UUID;
ALTER TABLE po_lines ALTER COLUMN po_id DROP NOT NULL;
ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft','inventory_check','store_pricing','market_pricing','price_verification',
    'pending_approval','approved','ready_to_issue','items_bought','goods_received',
    'finance_audit','invoiced','completed','rejected','cancelled','deleted',
    'bought','finance_review','payment_pending','closed'
  ));
CREATE TABLE po_line_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), po_line_id UUID NOT NULL,
  vendor_id UUID NOT NULL, currency_code CHAR(3) NOT NULL, qty NUMERIC(20,4) NOT NULL,
  actual_unit_price NUMERIC(20,4) NOT NULL, bought_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE system_configuration
  ADD COLUMN default_unallocated_purchase_account_id UUID,
  ADD COLUMN default_unallocated_cost_center_id UUID;

-- ── Backfill (verbatim logic, see migration 258 sections 4-7) ──────────
CREATE TEMP TABLE g1_po_classification AS
SELECT po.id AS po_id, po.company_id, po.branch_id, po.project_id, po.purpose,
  po.delivery_destination, po.priority, po.organizer_id, po.notes,
  po.status AS old_status, po.vendor_id, po.created_at,
  CASE
    WHEN po.status IN ('draft','inventory_check','store_pricing','market_pricing','price_verification','pending_approval') THEN 'TOMBSTONE'
    WHEN po.status IN ('cancelled','rejected') AND po.vendor_id IS NULL THEN 'TOMBSTONE'
    WHEN po.status IN ('ready_to_issue','completed') AND po.vendor_id IS NULL THEN 'COMPLETED_NO_CHILD'
    ELSE 'BECOMES_CHILD'
  END AS category
FROM purchase_orders po WHERE po.status != 'deleted';

CREATE TEMP TABLE g1_requisitions_to_create AS
SELECT c.*, gen_random_uuid() AS new_requisition_id, 'REQ-MIG-' || substr(c.po_id::text,1,8) AS requisition_number,
  CASE
    WHEN c.category = 'COMPLETED_NO_CHILD' THEN 'completed'
    ELSE c.old_status
  END AS new_requisition_status
FROM g1_po_classification c WHERE c.category IN ('TOMBSTONE','COMPLETED_NO_CHILD');

CREATE TEMP TABLE g1_requisitions_for_children AS
SELECT c.*, gen_random_uuid() AS new_requisition_id, 'REQ-MIG-' || substr(c.po_id::text,1,8) AS requisition_number,
  CASE WHEN c.old_status = 'completed' THEN 'completed' WHEN c.old_status IN ('cancelled','rejected') THEN c.old_status ELSE 'sourcing' END AS new_requisition_status
FROM g1_po_classification c WHERE c.category = 'BECOMES_CHILD';

INSERT INTO requisitions (id, company_id, branch_id, requisition_number, project_id, purpose, delivery_destination, priority, organizer_id, notes, status, created_at)
SELECT new_requisition_id, company_id, branch_id, requisition_number, project_id, purpose, delivery_destination, priority, organizer_id, notes, new_requisition_status, created_at FROM g1_requisitions_to_create
UNION ALL
SELECT new_requisition_id, company_id, branch_id, requisition_number, project_id, purpose, delivery_destination, priority, organizer_id, notes, new_requisition_status, created_at FROM g1_requisitions_for_children;

UPDATE purchase_orders po SET status='deleted', superseded_by_requisition_id=r.new_requisition_id, requisition_id=r.new_requisition_id, updated_at=NOW()
FROM g1_requisitions_to_create r WHERE po.id = r.po_id;

UPDATE po_lines pl SET requisition_id=r.new_requisition_id, po_id=NULL
FROM g1_requisitions_to_create r WHERE pl.po_id = r.po_id;

UPDATE purchase_orders po SET requisition_id=r.new_requisition_id,
  status = CASE po.status
    WHEN 'items_bought' THEN 'bought' WHEN 'goods_received' THEN 'goods_received'
    WHEN 'finance_audit' THEN 'finance_review' WHEN 'invoiced' THEN 'payment_pending'
    WHEN 'completed' THEN 'closed' WHEN 'cancelled' THEN 'cancelled' WHEN 'rejected' THEN 'cancelled'
    ELSE po.status END,
  updated_at=NOW()
FROM g1_requisitions_for_children r WHERE po.id = r.po_id;

UPDATE po_lines pl SET requisition_id=r.new_requisition_id
FROM g1_requisitions_for_children r WHERE pl.po_id = r.po_id;

INSERT INTO po_line_purchases (po_line_id, vendor_id, currency_code, qty, actual_unit_price, bought_at)
SELECT pl.id, po.vendor_id, pl.currency_code,
  CASE WHEN COALESCE(pl.qty_received,0) > 0 THEN pl.qty_received ELSE pl.qty_ordered END,
  COALESCE(pl.actual_unit_price, pl.unit_price), po.created_at
FROM po_lines pl JOIN purchase_orders po ON po.id = pl.po_id
WHERE pl.po_id IS NOT NULL AND po.vendor_id IS NOT NULL;

-- ── Report, in the same shape as the G8 step 1 projection ──────────────
SELECT 'TOMBSTONED' AS category, COUNT(*) AS po_count
FROM g1_po_classification WHERE category = 'TOMBSTONE'
UNION ALL
SELECT 'COMPLETED_NO_CHILD', COUNT(*) FROM g1_po_classification WHERE category = 'COMPLETED_NO_CHILD'
UNION ALL
SELECT 'BECOMES_CHILD (total)', COUNT(*) FROM g1_po_classification WHERE category = 'BECOMES_CHILD';

SELECT 'BECOMES_CHILD by new status' AS breakdown, po.status, COUNT(*) AS po_count
FROM purchase_orders po
JOIN g1_requisitions_for_children r ON r.po_id = po.id
GROUP BY po.status ORDER BY po.status;

SELECT 'NO-VENDOR AT PURCHASING-STAGE (bought entries not created)' AS label,
  COUNT(DISTINCT po.id) AS po_count, COUNT(pl.id) AS line_count
FROM purchase_orders po
JOIN po_lines pl ON pl.po_id = po.id
JOIN g1_requisitions_for_children r ON r.po_id = po.id
WHERE po.vendor_id IS NULL;

SELECT 'UNTAGGED LINES (account_id/cost_center_id) — expected no-op, system_configuration defaults unset' AS label,
  COUNT(*) AS total_lines,
  COUNT(*) FILTER (WHERE account_id IS NOT NULL) AS tagged_by_this_run
FROM po_lines;

ROLLBACK;
