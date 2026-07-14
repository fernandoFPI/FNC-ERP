-- Migration 129: Cost Control — Labor Timesheet Entries

CREATE TABLE IF NOT EXISTS project_labor_entries (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_code_id    UUID          REFERENCES project_cost_codes(id) ON DELETE SET NULL,
  activity_id     UUID          REFERENCES project_activities(id) ON DELETE SET NULL,
  work_date       DATE          NOT NULL,
  trade           VARCHAR(100)  NOT NULL,
  worker_name     VARCHAR(255),
  regular_hours   NUMERIC(8,2)  NOT NULL DEFAULT 0,
  overtime_hours  NUMERIC(8,2)  NOT NULL DEFAULT 0,
  cost_per_hour   NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  entered_by      UUID          REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_labor_project   ON project_labor_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_labor_date      ON project_labor_entries(work_date);
CREATE INDEX IF NOT EXISTS idx_labor_code      ON project_labor_entries(cost_code_id);
