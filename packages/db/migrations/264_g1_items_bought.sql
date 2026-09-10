-- G1 Phase 2 PR 3 — Items Bought: record purchase (actual vendor/price/
-- qty/receipt), split a line across vendors (already supported by
-- po_line_purchases being one row per line+vendor, migration 258 — no
-- schema change needed for that part), mark a line short, and tolerance
-- flag/override (over_tolerance/tolerance_approved_by already exist on
-- po_line_purchases too, migration 258 — this migration only adds what's
-- actually missing: the "mark short" columns, and letting a receipt photo
-- attach directly to one bought entry).

BEGIN;

-- Buyer explicitly closes out a line's remaining not-yet-purchased qty as
-- unfulfillable (vendor can't supply more), rather than leaving Finish
-- Buying (PR 4) waiting forever on a delivery that will never come.
-- Terminal per line — recordLinePurchase refuses further entries once set
-- (see resolver). No "unmark" mutation: not requested, and correcting a
-- mistake here is a rare enough case to handle via direct DB access rather
-- than a speculative undo endpoint.
ALTER TABLE po_lines
  ADD COLUMN short_reason TEXT,
  ADD COLUMN short_marked_by UUID REFERENCES users(id),
  ADD COLUMN short_marked_at TIMESTAMPTZ;

-- Widen the entity_type CHECK additively so a receipt photo can attach
-- directly to one po_line_purchases row, the same way attachReceiptPhoto
-- already does for po_receipts (entity_type='po_receipt'). Full current
-- list carried forward unchanged from migration 233, the most recent prior
-- writer of this constraint — only 'po_line_purchase' is new.
ALTER TABLE document_attachments DROP CONSTRAINT document_attachments_entity_type_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order', 'po_receipt', 'project_contract', 'project_invoice', 'project',
    'vendor', 'employee', 'payroll_run', 'manufacturing_order', 'rental_contract',
    'interco_transaction', 'po_return', 'rfq_phase', 'rfi', 'submittal',
    'site_instruction', 'inspection_request', 'ncr', 'hse_record', 'transmittal',
    'bid_deliverable', 'bid_package_technical', 'bid_package_commercial',
    'handover_cert', 'material_issue', 'tq', 'po_line_purchase'
  ));

COMMIT;
