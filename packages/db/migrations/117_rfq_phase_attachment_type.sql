-- Allow rfq_phase as a valid attachment entity type
ALTER TABLE document_attachments DROP CONSTRAINT IF EXISTS document_attachments_entity_type_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order','po_receipt','project_contract','project_invoice',
    'project','vendor','employee','payroll_run','manufacturing_order',
    'rental_contract','interco_transaction','po_return','rfq_phase'
  ));
