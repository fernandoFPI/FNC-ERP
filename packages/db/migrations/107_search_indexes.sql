-- Enable pg_trgm for fast trigram-based ILIKE across search entities
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Purchase orders
CREATE INDEX IF NOT EXISTS idx_po_number_trgm
  ON purchase_orders USING GIN (po_number gin_trgm_ops);

-- Vendors
CREATE INDEX IF NOT EXISTS idx_vendor_name_trgm
  ON vendors USING GIN (name gin_trgm_ops);

-- Projects
CREATE INDEX IF NOT EXISTS idx_project_name_trgm
  ON projects USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_project_code_trgm
  ON projects USING GIN (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_project_client_trgm
  ON projects USING GIN (client_name gin_trgm_ops);

-- Employees
CREATE INDEX IF NOT EXISTS idx_emp_first_trgm
  ON employees USING GIN (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_emp_last_trgm
  ON employees USING GIN (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_emp_number_trgm
  ON employees USING GIN (employee_number gin_trgm_ops);

-- Project invoices
CREATE INDEX IF NOT EXISTS idx_pinv_number_trgm
  ON project_invoices USING GIN (invoice_number gin_trgm_ops);

-- Project contracts
CREATE INDEX IF NOT EXISTS idx_pcon_client_trgm
  ON project_contracts USING GIN (client_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pcon_number_trgm
  ON project_contracts USING GIN (contract_number gin_trgm_ops);

-- Rental contracts
CREATE INDEX IF NOT EXISTS idx_rcon_number_trgm
  ON rental_contracts USING GIN (contract_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rcon_client_trgm
  ON rental_contracts USING GIN (client_name gin_trgm_ops);
