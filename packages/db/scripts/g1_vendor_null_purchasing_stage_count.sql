-- Read-only. Counts POs that reached a purchasing-stage status
-- (items_bought/goods_received/finance_audit/invoiced/completed/
-- cancelled/rejected) with vendor_id IS NULL — a state the app's own
-- state machine shouldn't allow (submitPOMarketPricing requires a
-- vendorId), found via the G1 Phase 1 migration's dry run on dev (20
-- lines / 15 POs, not all obviously test fixtures by po_number shape).
-- Sizes the gap on prod before deciding how Phase 1's backfill should
-- treat these lines.
--
-- Usage: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/g1_vendor_null_purchasing_stage_count.sql

\set ON_ERROR_STOP on

SELECT po.id, po.po_number, po.status, COUNT(pl.id) AS line_count
FROM purchase_orders po
JOIN po_lines pl ON pl.po_id = po.id
WHERE po.vendor_id IS NULL
  AND po.status IN ('items_bought','goods_received','finance_audit','invoiced','completed','cancelled','rejected')
GROUP BY po.id, po.po_number, po.status
ORDER BY po.status;
