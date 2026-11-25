BEGIN;

-- Organizer review: "Use stock instead" can now be undone, and can cover only PART of a line (playbook #120).
-- Each use of stock instead of a purchase leaves one entry here, in the order they were made: what the line looked like before, the
-- purchases it removed or reduced AS FULL ROWS (to_jsonb of the purchase and of its receipt attachments, so they can be put back
-- exactly, vendor id and receipt file included) and what it reserved. Undo takes the last entry off and reverses it. A summary
-- that kept only the vendor name (review_replaced, migration 333) could not rebuild a purchase, which is why this is separate.
-- NULL means nothing to undo. Lines replaced before this migration have no entry and stay as they are.
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS review_stock_undo JSONB;

COMMIT;
