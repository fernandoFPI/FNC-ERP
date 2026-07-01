-- Project contracts
CREATE INDEX idx_contracts_project ON project_contracts(project_id);
CREATE INDEX idx_contracts_status ON project_contracts(status) WHERE status = 'active';

-- Project milestones
CREATE INDEX idx_milestones_contract ON project_milestones(contract_id, sequence);
CREATE INDEX idx_milestones_status ON project_milestones(status) WHERE status = 'reached';
CREATE INDEX idx_milestones_stage ON project_milestones(stage_id) WHERE stage_id IS NOT NULL;

-- Project invoices
CREATE INDEX idx_invoices_contract ON project_invoices(contract_id);
CREATE INDEX idx_invoices_project ON project_invoices(project_id);
CREATE INDEX idx_invoices_status ON project_invoices(company_id, status);
CREATE INDEX idx_invoices_due ON project_invoices(due_date) WHERE status IN ('issued','partial');

-- Invoice lines
CREATE INDEX idx_invoice_lines_invoice ON project_invoice_lines(invoice_id, line_number);
CREATE INDEX idx_invoice_lines_source ON project_invoice_lines(source_type, source_id);
CREATE INDEX idx_invoice_lines_uninvoiced ON project_invoice_lines(source_type, is_invoiced)
  WHERE is_invoiced = false;

-- Material issues
CREATE INDEX idx_material_issues_project ON project_material_issues(project_id);
CREATE INDEX idx_material_issue_lines_issue ON project_material_issue_lines(issue_id);
CREATE INDEX idx_material_issue_lines_product ON project_material_issue_lines(product_id);
CREATE INDEX idx_material_issue_uninvoiced ON project_material_issue_lines(is_invoiced)
  WHERE is_invoiced = false;

-- Payments
CREATE INDEX idx_invoice_payments_invoice ON project_invoice_payments(invoice_id);
CREATE INDEX idx_invoice_payments_date ON project_invoice_payments(payment_date DESC);
