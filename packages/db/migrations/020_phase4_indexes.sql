-- ── PROJECTS INDEXES ──────────────────────────────────────────
CREATE INDEX idx_projects_company_status ON projects(company_id, status);
CREATE INDEX idx_projects_analytic ON projects(analytic_account_id);
CREATE INDEX idx_projects_manager ON projects(project_manager_id);
CREATE INDEX idx_projects_active ON projects(company_id, status)
  WHERE status IN ('pending','active','on_hold','submitted');

CREATE INDEX idx_project_stages_project ON project_stages(project_id, sequence);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_employee ON project_members(employee_id);
CREATE INDEX idx_project_budget_project ON project_budget_lines(project_id);
CREATE INDEX idx_project_cost_project ON project_cost_actuals(project_id, entry_date DESC);
CREATE INDEX idx_project_cost_line ON project_cost_actuals(journal_line_id);

-- ── MANUFACTURING INDEXES ──────────────────────────────────────
CREATE INDEX idx_mo_company_status ON manufacturing_orders(company_id, status);
CREATE INDEX idx_mo_project ON manufacturing_orders(project_id);
CREATE INDEX idx_mo_bom ON manufacturing_orders(bom_id);
CREATE INDEX idx_mo_scheduled ON manufacturing_orders(scheduled_start, scheduled_end);
CREATE INDEX idx_mo_active ON manufacturing_orders(company_id, status)
  WHERE status IN ('confirmed','in_progress');

CREATE INDEX idx_bom_product ON boms(finished_product_id);
CREATE INDEX idx_bom_active ON boms(company_id, is_active) WHERE is_active = true;
CREATE INDEX idx_bom_lines_bom ON bom_lines(bom_id);
CREATE INDEX idx_bom_lines_component ON bom_lines(component_product_id);

CREATE INDEX idx_mo_consumption_mo ON mo_consumptions(mo_id);
CREATE INDEX idx_mo_wc_time_mo ON mo_work_center_time(mo_id);
CREATE INDEX idx_work_centers_company ON work_centers(company_id);

-- ── RENTAL INDEXES ────────────────────────────────────────────
CREATE INDEX idx_assets_company_status ON equipment_assets(company_id, status);
CREATE INDEX idx_assets_available ON equipment_assets(company_id, status)
  WHERE status = 'available';

CREATE INDEX idx_rental_contracts_status ON rental_contracts(company_id, status);
CREATE INDEX idx_rental_contracts_project ON rental_contracts(project_id);
CREATE INDEX idx_rental_contracts_active ON rental_contracts(status)
  WHERE status = 'active';
CREATE INDEX idx_rental_lines_contract ON rental_contract_lines(contract_id);
CREATE INDEX idx_rental_lines_asset ON rental_contract_lines(asset_id);
CREATE INDEX idx_rental_invoices_contract ON rental_invoices(contract_id);
CREATE INDEX idx_rental_invoices_status ON rental_invoices(status)
  WHERE status IN ('draft','issued');

-- NOTE: withholding_tax_type/rate columns on vendors are applied separately
-- via psql as postgres (postgres owns vendors, ALTER TABLE requires ownership)
