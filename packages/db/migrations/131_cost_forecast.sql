-- Migration 131: Cost Control — Cost Forecast (ETC/EAC per cost code)

CREATE TABLE IF NOT EXISTS project_cost_forecast (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_code_id  UUID          REFERENCES project_cost_codes(id) ON DELETE SET NULL,
  forecast_date DATE          NOT NULL DEFAULT CURRENT_DATE,
  etc_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  eac_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  prepared_by   UUID          REFERENCES users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, cost_code_id, forecast_date)
);
CREATE INDEX IF NOT EXISTS idx_forecast_project ON project_cost_forecast(project_id);
CREATE INDEX IF NOT EXISTS idx_forecast_code    ON project_cost_forecast(cost_code_id);
