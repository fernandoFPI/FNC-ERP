BEGIN;

-- Organizer review: the organizer may also correct a purchase's CURRENCY (playbook #116). Like the quantity and the price, the
-- first change remembers what the purchase held when the review began, so the approver reads "was 5 USD, now 5 IQD" and a change
-- back leaves the purchase untouched. NULL means the currency was not changed in this review.
ALTER TABLE po_line_purchases
  ADD COLUMN IF NOT EXISTS review_original_currency VARCHAR(3);

COMMIT;
