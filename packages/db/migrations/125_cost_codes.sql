-- Migration 125: Cost Control — Cost Code Structure

CREATE TABLE IF NOT EXISTS project_cost_codes (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wbs_id        UUID          REFERENCES project_wbs(id) ON DELETE SET NULL,
  code          VARCHAR(50)   NOT NULL,
  name          VARCHAR(255)  NOT NULL,
  category      VARCHAR(30)   NOT NULL DEFAULT 'other'
                              CHECK (category IN ('labor','material','equipment','subcontract','overhead','contingency','other')),
  budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  sequence      INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_cost_codes_project ON project_cost_codes(project_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_wbs     ON project_cost_codes(wbs_id);
