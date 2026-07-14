-- Migration 126: Cost Control — Committed Costs Register

CREATE TABLE IF NOT EXISTS project_committed_costs (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_code_id          UUID          REFERENCES project_cost_codes(id) ON DELETE SET NULL,
  commitment_type       VARCHAR(20)   NOT NULL DEFAULT 'manual'
                                      CHECK (commitment_type IN ('po','subcontract','rental','manual')),
  reference_id          UUID,
  reference_number      VARCHAR(100),
  description           VARCHAR(255)  NOT NULL,
  vendor_name           VARCHAR(255),
  committed_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  invoiced_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  paid_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency_code         VARCHAR(3)    NOT NULL DEFAULT 'USD',
  commitment_date       DATE,
  expected_invoice_date DATE,
  status                VARCHAR(25)   NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active','partially_invoiced','fully_invoiced','cancelled')),
  notes                 TEXT,
  created_by            UUID          REFERENCES users(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_committed_project  ON project_committed_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_committed_code     ON project_committed_costs(cost_code_id);
CREATE INDEX IF NOT EXISTS idx_committed_ref      ON project_committed_costs(reference_id);
