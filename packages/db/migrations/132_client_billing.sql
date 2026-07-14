-- Migration 132: Cost Control — Client Progress Billing (AR)

CREATE TABLE IF NOT EXISTS project_client_billings (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  billing_number       VARCHAR(50)   NOT NULL,
  billing_date         DATE          NOT NULL,
  period_from          DATE,
  period_to            DATE,
  gross_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  retention_percentage NUMERIC(5,2)  NOT NULL DEFAULT 10,
  retention_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  certified_amount     NUMERIC(15,2),
  certified_date       DATE,
  paid_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  paid_date            DATE,
  status               VARCHAR(20)   NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft','submitted','certified','paid','disputed')),
  notes                TEXT,
  created_by           UUID          REFERENCES users(id),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, billing_number)
);
CREATE INDEX IF NOT EXISTS idx_client_billing_project ON project_client_billings(project_id);
