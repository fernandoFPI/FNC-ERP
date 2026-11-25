BEGIN;

-- Re-approval (review_approval): when the organizer took items from stock in the review, the store keeper has to sign off on
-- them BEFORE the PO Admin / administrator can approve (playbook #123). The decision is kept on the requisition itself:
-- NULL means "not decided yet" (also the state after every new submission), 'approved' lets the administrator approve,
-- 'rejected' keeps the reason in front of the administrator, who has the final say (he sends it back to the organizer).
-- The Store Out and the purchase orders are still made only after the administrator's approval, as before.
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS stock_review_status VARCHAR(10),
  ADD COLUMN IF NOT EXISTS stock_review_by     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS stock_review_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stock_review_reason TEXT;

ALTER TABLE requisitions
  DROP CONSTRAINT IF EXISTS requisitions_stock_review_status_check;
ALTER TABLE requisitions
  ADD CONSTRAINT requisitions_stock_review_status_check
  CHECK (stock_review_status IS NULL OR stock_review_status IN ('approved', 'rejected'));

COMMIT;
