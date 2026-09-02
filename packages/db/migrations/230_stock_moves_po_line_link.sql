-- Links a stock_moves row back to the exact po_lines / po_receipt_lines row
-- that caused it. Neither existed before: receipt-driven moves only carry
-- source_id = po_receipts.id (the whole receipt, ambiguous when a receipt
-- has multiple lines for the same product), and issuance-driven moves only
-- carry source_id = project_material_issues.id. Both are nullable and
-- populated only going forward (see confirmReceipt / issueMaterialIssue in
-- services/gateway/src/graphql/resolvers.ts) -- needed so a future admin
-- correction to a PO line can find the exact stock_moves row(s) it produced
-- without guessing across multiple lines sharing the same product/source.
ALTER TABLE stock_moves
  ADD COLUMN IF NOT EXISTS po_line_id UUID REFERENCES po_lines(id),
  ADD COLUMN IF NOT EXISTS po_receipt_line_id UUID REFERENCES po_receipt_lines(id);

CREATE INDEX IF NOT EXISTS idx_stock_moves_po_line
  ON stock_moves(po_line_id) WHERE po_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_moves_po_receipt_line
  ON stock_moves(po_receipt_line_id) WHERE po_receipt_line_id IS NOT NULL;
