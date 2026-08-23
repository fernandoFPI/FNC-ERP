-- Migration 201: add 'material_issue' to document_attachments entity_type CHECK constraint
--
-- Store Out (project_material_issues) attachments reuse the existing
-- polymorphic document_attachments table (same pattern as rfi/ncr/
-- handover_cert/etc.) — for attaching the physically-signed printed copy
-- back onto the Store Out record it was printed from.

ALTER TABLE document_attachments DROP CONSTRAINT document_attachments_entity_type_check;

ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order', 'po_receipt', 'project_contract', 'project_invoice', 'project',
    'vendor', 'employee', 'payroll_run', 'manufacturing_order', 'rental_contract',
    'interco_transaction', 'po_return', 'rfq_phase', 'rfi', 'submittal',
    'site_instruction', 'inspection_request', 'ncr', 'hse_record', 'transmittal',
    'bid_deliverable', 'bid_package_technical', 'bid_package_commercial',
    'handover_cert', 'material_issue'
  ));
