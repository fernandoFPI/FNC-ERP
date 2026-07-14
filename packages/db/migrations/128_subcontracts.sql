-- Migration 128: Cost Control — Subcontracts + Billing

CREATE TABLE IF NOT EXISTS project_subcontracts (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_code_id          UUID          REFERENCES project_cost_codes(id) ON DELETE SET NULL,
  subcontract_number    VARCHAR(50)   NOT NULL,
  subcontractor_name    VARCHAR(255)  NOT NULL,
  description           TEXT,
  scope_of_work         TEXT,
  contract_value        NUMERIC(15,2) NOT NULL DEFAULT 0,
  revised_value         NUMERIC(15,2) NOT NULL DEFAULT 0,
  retention_percentage  NUMERIC(5,2)  NOT NULL DEFAULT 10,
  retention_released    NUMERIC(15,2) NOT NULL DEFAULT 0,
  certified_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  paid_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency_code         VARCHAR(3)    NOT NULL DEFAULT 'USD',
  start_date            DATE,
  end_date              DATE,
  status                VARCHAR(20)   NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('draft','active','completed','terminated')),
  created_by            UUID          REFERENCES users(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, subcontract_number)
);
CREATE INDEX IF NOT EXISTS idx_subcontracts_project ON project_subcontracts(project_id);

CREATE TABLE IF NOT EXISTS project_subcontract_billings (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  subcontract_id    UUID          NOT NULL REFERENCES project_subcontracts(id) ON DELETE CASCADE,
  billing_number    VARCHAR(50)   NOT NULL,
  billing_date      DATE          NOT NULL,
  gross_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  retention_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  certified_amount  NUMERIC(15,2),
  certified_date    DATE,
  paid_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  paid_date         DATE,
  status            VARCHAR(20)   NOT NULL DEFAULT 'submitted'
                                  CHECK (status IN ('submitted','certified','paid','disputed')),
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sc_billings_subcontract ON project_subcontract_billings(subcontract_id);
