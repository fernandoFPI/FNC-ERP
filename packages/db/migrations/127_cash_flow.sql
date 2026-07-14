-- Migration 127: Cost Control — Monthly Cash Flow

CREATE TABLE IF NOT EXISTS project_cash_flow (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_year      INTEGER       NOT NULL,
  period_month     INTEGER       NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  planned_outflow  NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_outflow   NUMERIC(15,2) NOT NULL DEFAULT 0,
  forecast_outflow NUMERIC(15,2) NOT NULL DEFAULT 0,
  planned_inflow   NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_inflow    NUMERIC(15,2) NOT NULL DEFAULT 0,
  forecast_inflow  NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  updated_by       UUID          REFERENCES users(id),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_cash_flow_project ON project_cash_flow(project_id);
