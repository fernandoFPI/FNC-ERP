-- Migration 135: Add execution module entity types to document_attachments check constraint
ALTER TABLE document_attachments DROP CONSTRAINT IF EXISTS document_attachments_entity_type_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order','po_receipt','project_contract','project_invoice',
    'project','vendor','employee','payroll_run','manufacturing_order',
    'rental_contract','interco_transaction','po_return','rfq_phase',
    'rfi','submittal','site_instruction','inspection_request','ncr','hse_record','transmittal',
    'bid_deliverable'
  ));
