-- Migration 295: add 'journal_entry' to document_attachments entity_type
-- CHECK constraint
-- ─────────────────────────────────────────────────────────────────────────
-- 'journal_entry' has been in packages/db/src/attachments.ts's EntityType
-- TypeScript union since that file's very first version, but was never
-- actually added here — the TS type let it through at compile time while
-- the DB happily rejected every real insert attempt (caught live, writing
-- the Journal Entries page's new Attachments section — see playbook #20,
-- the same recurring gotcha as migrations 233/264/284/293). Full current
-- list carried forward unchanged from migration 293, the most recent prior
-- writer of this constraint — only 'journal_entry' is new.
ALTER TABLE document_attachments DROP CONSTRAINT document_attachments_entity_type_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order', 'po_receipt', 'project_contract', 'project_invoice', 'project',
    'vendor', 'employee', 'payroll_run', 'manufacturing_order', 'rental_contract',
    'interco_transaction', 'po_return', 'rfq_phase', 'rfi', 'submittal',
    'site_instruction', 'inspection_request', 'ncr', 'hse_record', 'transmittal',
    'bid_deliverable', 'bid_package_technical', 'bid_package_commercial',
    'handover_cert', 'material_issue', 'tq', 'po_line_purchase', 'daily_report',
    'expense_claim', 'expense_claim_line', 'journal_entry'
  ));
