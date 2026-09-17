-- Supports the new per-row item_search_text/itemSearchText correlated subquery
-- on the requisitions list resolver (search PO/Requisition by item name/SKU),
-- mirroring idx_po_lines_po which already exists for the PO side.
CREATE INDEX IF NOT EXISTS idx_po_lines_requisition ON po_lines(requisition_id);
