-- Migration 188: add 'handover_cert' to document_attachments entity_type CHECK constraint
--
-- Handover certificate attachments reuse the existing polymorphic
-- document_attachments table (same pattern as rfi/site_instruction/ncr/
-- hse_record/bid_deliverable), but the CHECK constraint's whitelist was
-- never updated to include the new entity_type value. Without this,
-- uploadHandoverCertFile fails with a constraint violation on every call.

ALTER TABLE document_attachments DROP CONSTRAINT document_attachments_entity_type_check;

ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order', 'po_receipt', 'project_contract', 'project_invoice', 'project',
    'vendor', 'employee', 'payroll_run', 'manufacturing_order', 'rental_contract',
    'interco_transaction', 'po_return', 'rfq_phase', 'rfi', 'submittal',
    'site_instruction', 'inspection_request', 'ncr', 'hse_record', 'transmittal',
    'bid_deliverable', 'bid_package_technical', 'bid_package_commercial',
    'handover_cert'
  ));
