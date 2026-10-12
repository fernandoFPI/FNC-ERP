-- po_line_comments.po_id was NOT NULL, so the Line Comments thread (already
-- live on Purchase Orders — reply/flag/resolve) could never be used on a
-- requisition-stage line, which has no po_id yet (po_lines.requisition_id is
-- always set; po_id is only added once a vendor PO exists — see migration
-- 258). Same nullability fix already applied to po_lines/po_edit_requests.
ALTER TABLE po_line_comments ALTER COLUMN po_id DROP NOT NULL;
