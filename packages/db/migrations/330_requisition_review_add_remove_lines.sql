BEGIN;

-- Organizer review, add and remove lines (playbook #116). While a requisition is in the organizer's review he can
-- add an item that was bought but forgotten, or remove a line that should not have been there. Either one is a change a PO Admin
-- has to approve before any purchase order exists.
--
-- 1. A line added in the review is marked, so the approver sees it as "Added in review" (and that it never went through the
--    inventory check or the pricing steps). NULL means the line was part of the requisition as approved.
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS review_added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_added_at TIMESTAMPTZ;

-- 2. A removed line is gone, and so are its purchases and their receipts, so what it was is kept here at the moment it is
--    removed (a history that stores only ids of rows it then deletes can never say which row it was, playbook #36). The
--    approver reads this list; the requisition's own rows (company, requisition) are what scope it.
CREATE TABLE IF NOT EXISTS requisition_review_removed_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id  UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id),
  line_number     INTEGER,
  description     TEXT NOT NULL DEFAULT '',
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  qty_ordered     NUMERIC(20,4) NOT NULL DEFAULT 0,
  qty_from_stock  NUMERIC(20,4) NOT NULL DEFAULT 0,
  uom             VARCHAR(20),
  currency_code   VARCHAR(3),
  unit_price      NUMERIC(20,4),
  -- what had been bought on the line: [{ vendor, qty, price, currency, had_receipt, bought_by }]
  purchases       JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason          TEXT NOT NULL,
  removed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  removed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_review_removed_lines_req
  ON requisition_review_removed_lines (requisition_id);

COMMIT;
