-- Migration 293: add 'expense_claim' and 'expense_claim_line' to
-- document_attachments entity_type CHECK constraint
-- ─────────────────────────────────────────────────────────────────────────
-- Widen entity_type additively so an expense claim's receipt photos (one
-- shared for the whole claim, or one per line) can attach via the same
-- document_attachments table every other entity uses. Full current list
-- carried forward unchanged from migration 284, the most recent prior
-- writer of this constraint — only 'expense_claim'/'expense_claim_line' are
-- new.
ALTER TABLE document_attachments DROP CONSTRAINT document_attachments_entity_type_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order', 'po_receipt', 'project_contract', 'project_invoice', 'project',
    'vendor', 'employee', 'payroll_run', 'manufacturing_order', 'rental_contract',
    'interco_transaction', 'po_return', 'rfq_phase', 'rfi', 'submittal',
    'site_instruction', 'inspection_request', 'ncr', 'hse_record', 'transmittal',
    'bid_deliverable', 'bid_package_technical', 'bid_package_commercial',
    'handover_cert', 'material_issue', 'tq', 'po_line_purchase', 'daily_report',
    'expense_claim', 'expense_claim_line'
  ));
