-- Migration 130: Cost Control — Equipment Utilization Log

CREATE TABLE IF NOT EXISTS project_equipment_log (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_code_id    UUID          REFERENCES project_cost_codes(id) ON DELETE SET NULL,
  log_date        DATE          NOT NULL,
  equipment_name  VARCHAR(255)  NOT NULL,
  equipment_type  VARCHAR(50),
  ownership       VARCHAR(10)   NOT NULL DEFAULT 'rented'
                                CHECK (ownership IN ('owned','rented')),
  working_hours   NUMERIC(8,2)  NOT NULL DEFAULT 0,
  standby_hours   NUMERIC(8,2)  NOT NULL DEFAULT 0,
  cost_per_hour   NUMERIC(10,2) NOT NULL DEFAULT 0,
  standby_rate    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  entered_by      UUID          REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipment_project ON project_equipment_log(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_date    ON project_equipment_log(log_date);
