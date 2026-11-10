-- Migration 321: two more Bidding Stage file areas, Cost Analysis and Clarifications.
-- ─────────────────────────────────────────────────────────────────────────
-- Same shape as migration 171 (Technical / Commercial bid packages): a file
-- is a document_attachments row whose entity_id is projects.id and whose
-- entity_type says which Bidding sub-tab it belongs to. Clarifications used to
-- be the Technical Queries feature (project_tqs, entity_type 'tq'); it is now
-- a plain file area. project_tqs and the 'tq' value stay (production held 0
-- rows and 0 attachments on 2026-11-10; keeping them means a code-only
-- rollback still works, playbook #39).
-- Full current list carried forward unchanged from migration 295, the most
-- recent prior writer of this constraint (confirmed against production's
-- pg_get_constraintdef, read-only, 2026-11-10); only the two bid_package_*
-- values are new. Playbook #20.
ALTER TABLE document_attachments DROP CONSTRAINT document_attachments_entity_type_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order', 'po_receipt', 'project_contract', 'project_invoice', 'project',
    'vendor', 'employee', 'payroll_run', 'manufacturing_order', 'rental_contract',
    'interco_transaction', 'po_return', 'rfq_phase', 'rfi', 'submittal',
    'site_instruction', 'inspection_request', 'ncr', 'hse_record', 'transmittal',
    'bid_deliverable', 'bid_package_technical', 'bid_package_commercial',
    'bid_package_cost_analysis', 'bid_package_clarifications',
    'handover_cert', 'material_issue', 'tq', 'po_line_purchase', 'daily_report',
    'expense_claim', 'expense_claim_line', 'journal_entry'
  ));
