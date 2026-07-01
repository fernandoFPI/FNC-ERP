CREATE TABLE manufacturing_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number VARCHAR(50) NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES projects(id),
  requesting_company_id UUID NOT NULL REFERENCES companies(id),
  product_id UUID REFERENCES products(id),
  qty_requested NUMERIC(20,4) NOT NULL DEFAULT 1,
  required_date DATE,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','in_production','completed','cancelled')),
  requested_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  mo_id UUID REFERENCES manufacturing_orders(id),
  actual_cost NUMERIC(20,4),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  interco_transaction_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mr_project ON manufacturing_requests(project_id);
CREATE INDEX idx_mr_status ON manufacturing_requests(status);
CREATE INDEX idx_mr_mo ON manufacturing_requests(mo_id);
