-- Migration 171: bid package (technical/commercial ZIP bundle) attachment types.
-- Additive only — does not touch bid_deliverables, bid_cost_items,
-- bid_supplier_quotations, bid_commercial_summary, or bid revisioning.
-- entity_id for these two types is projects.id (one zone per project per bid type),
-- same shape already used by entity_type='project' (see AttachmentsTab).

ALTER TABLE document_attachments DROP CONSTRAINT IF EXISTS document_attachments_entity_type_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order','po_receipt','project_contract','project_invoice',
    'project','vendor','employee','payroll_run','manufacturing_order',
    'rental_contract','interco_transaction','po_return','rfq_phase',
    'rfi','submittal','site_instruction','inspection_request','ncr','hse_record','transmittal',
    'bid_deliverable','bid_package_technical','bid_package_commercial'
  ));
