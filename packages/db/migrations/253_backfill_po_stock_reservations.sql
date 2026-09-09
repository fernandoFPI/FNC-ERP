-- Backfill stock_balances.qty_reserved for POs whose lines already carry a
-- from-stock quantity, set before the reservation system (Site 1, in
-- confirmPOInventoryCheck) existed. Without this, only a PO confirmed AFTER
-- this migration ships gets a real qty_reserved claim behind its
-- qty_from_stock — every in-flight PO confirmed before it would otherwise
-- have zero protection against being oversold to a concurrent Store Out or
-- another PO's own reservation once Site 2's guard (issueMaterialIssue)
-- goes live expecting that reservation to already be there.
--
-- Reserves only the unissued remainder: qty_from_stock minus whatever has
-- already gone through a confirmed (non-draft) Store Out for that po_line —
-- mirrors the exact "remaining reserved" computation used by
-- releasePOStockReservations and applyPOEditChanges' qty_from_stock branch,
-- so backfilled data and the live resolvers agree on the same number.
--
-- One-time backfill, applied by the migration runner exactly once — must
-- not be re-run after Site 1 is live, since by then newly-confirmed POs
-- already carry their own real qty_reserved and would be double-reserved.
BEGIN;

WITH remaining AS (
  SELECT
    pl.product_id,
    pl.source_location_id,
    SUM(pl.qty_from_stock - COALESCE(issued.qty_issued_confirmed, 0)) AS remaining_qty
  FROM po_lines pl
  JOIN purchase_orders po ON po.id = pl.po_id
  LEFT JOIN (
    SELECT pmil.po_line_id, SUM(pmil.qty_issued) AS qty_issued_confirmed
    FROM project_material_issue_lines pmil
    JOIN project_material_issues pmi ON pmi.id = pmil.issue_id
    WHERE pmi.status != 'draft'
    GROUP BY pmil.po_line_id
  ) issued ON issued.po_line_id = pl.id
  WHERE pl.qty_from_stock > 0
    AND pl.source_location_id IS NOT NULL
    AND pl.product_id IS NOT NULL
    AND po.status NOT IN ('cancelled', 'rejected', 'deleted')
  GROUP BY pl.product_id, pl.source_location_id
)
UPDATE stock_balances sb
SET qty_reserved = sb.qty_reserved + GREATEST(r.remaining_qty, 0),
    updated_at = NOW()
FROM remaining r
WHERE sb.product_id = r.product_id
  AND sb.location_id = r.source_location_id
  AND sb.lot_id IS NULL
  AND r.remaining_qty > 0;

COMMIT;
