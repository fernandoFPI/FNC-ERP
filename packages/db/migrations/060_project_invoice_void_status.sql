ALTER TABLE project_invoices DROP CONSTRAINT IF EXISTS project_invoices_status_check;
ALTER TABLE project_invoices ADD CONSTRAINT project_invoices_status_check
  CHECK (status IN ('draft','review','approved','issued','partial','paid','cancelled','void'));
