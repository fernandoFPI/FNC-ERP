-- Read-only. Reports the G1 requisition-split migration's three target
-- populations, classified by STATUS (not vendor_id — setPOVendor can set
-- a vendor as early as 'draft', so vendor presence alone is not a safe
-- proxy for migration classification):
--
--   TOMBSTONE (early-stage, in-progress): status IN (draft,
--     inventory_check, store_pricing) — data moves to a NEW requisitions
--     row; the old purchase_orders row is tombstoned (status=deleted,
--     superseded_by_requisition_id set), never becomes a child PO.
--   COMPLETED-NO-CHILD (100% stock-covered, finished, never needed a
--     vendor): status IN (ready_to_issue, completed) AND vendor_id IS
--     NULL — becomes a completed requisition with no child PO at all;
--     old row is also tombstoned (nothing left for it to represent).
--   BECOMES-CHILD (vendor-committed at some point): everything else —
--     the existing purchase_orders row is KEPT AS-IS (same id), just
--     gains requisition_id pointing at a new, lightweight requisition row.
--
-- The vendor_id IS NULL breakdown is included for the earlier statuses
-- too, informationally only — a draft/inventory_check/store_pricing PO
-- that already has a vendor set via early setPOVendor is still classified
-- as TOMBSTONE by status (that vendor pick just carries over as a
-- suggested default when the requisition's lines later go through
-- per-line market pricing).
--
-- Usage: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/g1_pre_vendor_po_count.sql

\set ON_ERROR_STOP on

SELECT
  CASE
    WHEN status IN ('draft', 'inventory_check', 'store_pricing') THEN 'TOMBSTONE (early-stage)'
    WHEN status IN ('ready_to_issue', 'completed') AND vendor_id IS NULL THEN 'COMPLETED-NO-CHILD (100% stock-covered)'
    ELSE 'BECOMES-CHILD (vendor-committed)'
  END AS migration_category,
  status,
  vendor_id IS NOT NULL AS has_vendor,
  COUNT(*) AS po_count
FROM purchase_orders
GROUP BY migration_category, status, has_vendor
ORDER BY migration_category, po_count DESC;

SELECT
  CASE
    WHEN status IN ('draft', 'inventory_check', 'store_pricing') THEN 'TOMBSTONE (early-stage)'
    WHEN status IN ('ready_to_issue', 'completed') AND vendor_id IS NULL THEN 'COMPLETED-NO-CHILD (100% stock-covered)'
    ELSE 'BECOMES-CHILD (vendor-committed)'
  END AS migration_category,
  COUNT(*) AS po_count
FROM purchase_orders
GROUP BY migration_category
ORDER BY po_count DESC;

SELECT 'TOTAL' AS label, COUNT(*) AS total_purchase_orders FROM purchase_orders;

-- Sanity check: any PO past store_pricing with no vendor at all, that
-- ISN'T explained by the 100%-stock-covered ready_to_issue/completed
-- case — this would be data the migration plan hasn't accounted for and
-- needs to look at individually.
SELECT id, po_number, status, vendor_id, created_at
FROM purchase_orders
WHERE status NOT IN ('draft', 'inventory_check', 'store_pricing', 'ready_to_issue', 'completed')
  AND vendor_id IS NULL
ORDER BY created_at
LIMIT 50;
