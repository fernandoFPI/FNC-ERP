BEGIN;

-- Finance can send a purchase order that failed its review back to the requisition's Organizer Review, and it keeps its number
-- (playbook #129). The PO is NOT undone: it stays where it is, locked, in the new status below while the requisition is reopened;
-- when the review is approved again the changes are applied to this same PO.

-- 1. The new status. Only a child PO (one forked from a requisition) can be in it.
ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft', 'inventory_check', 'store_pricing', 'market_pricing',
    'price_verification', 'pending_approval', 'approved', 'ready_to_issue',
    'items_bought', 'goods_received', 'finance_audit', 'invoiced',
    'completed', 'rejected', 'cancelled', 'deleted',
    'bought', 'finance_review', 'payment_pending', 'closed',
    'returned_to_organizer'
  ));

-- 2. Why and when Finance sent it back, shown on the PO and the requisition. They keep the LAST send-back.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS returned_to_organizer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_to_organizer_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS returned_to_organizer_reason TEXT;

-- 3. Which purchase a purchase-order line was made from. The fork (forkChildPurchaseOrders) used to record only the line's origin
-- and the PO's vendor, which cannot tell two purchases of the same item from the same vendor apart. With this link a change the
-- organizer makes to a purchase in a reopened review lands on exactly its own PO line. NULL = not made from a purchase (a line
-- added to the PO later by an edit request, or one whose purchase could not be matched).
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES po_line_purchases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_po_lines_purchase_id ON po_lines (purchase_id) WHERE purchase_id IS NOT NULL;

-- Backfill for the POs already forked. The fork made one PO line per purchase, in the order of bought_at, and numbered a PO's lines
-- as it went, so within one (item, vendor) the k-th purchase is the k-th line. A group is linked only when the number of
-- purchases equals the number of lines; anything else (a line removed or added since) stays NULL and is refused when Finance tries
-- to send that PO back, with the reason named.
UPDATE po_lines pl
   SET purchase_id = m.purchase_id
  FROM (
    SELECT l.line_id, pu.purchase_id
      FROM (
        SELECT c.id AS line_id,
               COALESCE(c.origin_line_id, c.id) AS origin,
               po.vendor_id AS vendor_id,
               row_number() OVER (PARTITION BY COALESCE(c.origin_line_id, c.id), po.vendor_id ORDER BY c.line_number, c.id) AS rn,
               count(*)     OVER (PARTITION BY COALESCE(c.origin_line_id, c.id), po.vendor_id) AS cnt
          FROM po_lines c
          JOIN purchase_orders po ON po.id = c.po_id
         WHERE c.requisition_id IS NOT NULL
      ) l
      JOIN (
        SELECT plp.id AS purchase_id, plp.po_line_id AS origin, plp.vendor_id,
               row_number() OVER (PARTITION BY plp.po_line_id, plp.vendor_id ORDER BY plp.bought_at, plp.id) AS rn,
               count(*)     OVER (PARTITION BY plp.po_line_id, plp.vendor_id) AS cnt
          FROM po_line_purchases plp
      ) pu
        ON pu.origin = l.origin AND pu.vendor_id = l.vendor_id AND pu.rn = l.rn AND pu.cnt = l.cnt
  ) m
 WHERE pl.id = m.line_id AND pl.purchase_id IS NULL;

-- 4. What the organizer removed in a review counts toward that review only. When a reopened review ends, the rows are closed so a
-- later review does not count them again (the rows stay as history).
ALTER TABLE requisition_review_removed_lines
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

COMMIT;
