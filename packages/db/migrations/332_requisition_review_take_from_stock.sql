BEGIN;

-- Organizer review: taking part of a line from stock instead of buying it (playbook #117). The organizer, who sees the
-- purchases and their receipts, may find that what was NOT bought (the shortfall after lowering a purchase) is on the shelf.
-- He covers it from stock inside the review; a PO Admin approves it with the other changes. The quantity taken is remembered
-- on the line so the approver sees it, so "Put back" can undo exactly that part, and so it counts as a change. NULL means
-- nothing was taken from stock in this review (stock the Inventory Check gave the line is not counted here).
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS review_stock_qty NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS review_stock_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_stock_at  TIMESTAMPTZ;

COMMIT;
