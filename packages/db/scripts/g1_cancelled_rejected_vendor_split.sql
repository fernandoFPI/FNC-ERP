-- Read-only. The revised-design migration rule doesn't explicitly cover
-- cancelled/rejected POs. Proposed tie-breaker: vendor_id IS NOT NULL
-- means treat as BECOMES-CHILD (preserve the row, since receipts/invoices
-- could exist even for a later-cancelled PO); vendor_id IS NULL means
-- TOMBSTONE (nothing could reference it). This reports the split so that
-- default can be confirmed or overridden before Phase 1 is written.
--
-- Usage: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/g1_cancelled_rejected_vendor_split.sql

\set ON_ERROR_STOP on

SELECT status, vendor_id IS NOT NULL AS has_vendor, COUNT(*) AS po_count
FROM purchase_orders
WHERE status IN ('cancelled', 'rejected')
GROUP BY status, has_vendor
ORDER BY status, has_vendor;

-- For the has_vendor=true rows, also check whether anything downstream
-- actually references them (receipts, invoices, edit requests, comments)
-- — confirms whether "preserve as child" is load-bearing or just cautious.
SELECT po.id, po.po_number, po.status, po.vendor_id IS NOT NULL AS has_vendor,
  EXISTS(SELECT 1 FROM po_receipts WHERE po_id=po.id) AS has_receipts,
  EXISTS(SELECT 1 FROM vendor_invoices WHERE po_id=po.id) AS has_invoices,
  EXISTS(SELECT 1 FROM po_edit_requests WHERE po_id=po.id) AS has_edit_requests,
  EXISTS(SELECT 1 FROM po_line_comments WHERE po_id=po.id) AS has_comments
FROM purchase_orders po
WHERE po.status IN ('cancelled', 'rejected')
ORDER BY po.status, po.created_at;
