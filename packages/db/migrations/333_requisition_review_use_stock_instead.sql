BEGIN;

-- Organizer review: "Use stock instead" (playbook #118). When a line is covered from stock instead of from what was bought, the
-- purchases on it (and their receipts) are removed, so what they were is kept on the line at that moment: a history that stores only
-- the ids of rows it then deletes can never say which row it was (playbook #36). Same shape as the purchases kept for a removed
-- line: [{ vendor, qty, price, currency, had_receipt, bought_by }]. NULL means no purchase was replaced in this review.
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS review_replaced JSONB;

COMMIT;
