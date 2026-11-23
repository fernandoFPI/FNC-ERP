BEGIN;

-- Organizer review step (playbook #115): after the last purchase is recorded at Items Bought the requisition no longer
-- forks its child purchase orders by itself. It goes to 'organizer_review', where the organizer double-checks what was
-- bought and may change a purchase's quantity or price; any change (or the organizer having bought the items himself)
-- sends it to 'review_approval', where a PO Admin approves it. Only then are the purchase orders created and the
-- requisition moves to 'sourcing'.
--
-- 1. The two new statuses. The CHECK is the inline one migration 258 created; its automatic name is
--    requisitions_status_check. Forward-only: the old values are all kept.
ALTER TABLE requisitions DROP CONSTRAINT IF EXISTS requisitions_status_check;
ALTER TABLE requisitions
  ADD CONSTRAINT requisitions_status_check CHECK (status IN (
    'draft', 'inventory_check', 'store_pricing', 'market_pricing',
    'price_verification', 'pending_approval', 'approved', 'items_bought',
    'organizer_review', 'review_approval',
    'sourcing', 'completed', 'rejected', 'cancelled', 'deleted'
  ));

-- 2. What the organizer changed during the review. The first edit of a purchase keeps the values it had when the review
--    began, so the PO Admin sees "was / now" and an edit back to the original leaves the purchase unchanged.
--    All nullable and additive: NULL means "not edited in this review".
ALTER TABLE po_line_purchases
  ADD COLUMN IF NOT EXISTS review_original_qty   NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS review_original_price NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS review_edited_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_edited_at      TIMESTAMPTZ;

COMMIT;
