-- Migration 124: Planning — Resources, Calendars, Activity-Resource Assignments

CREATE TABLE IF NOT EXISTS project_resources (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             VARCHAR(255)  NOT NULL,
  resource_type    VARCHAR(20)   NOT NULL DEFAULT 'labor'
                                 CHECK (resource_type IN ('labor','equipment','material')),
  unit             VARCHAR(50)   NOT NULL DEFAULT 'hrs',
  max_units_per_day NUMERIC(10,2) NOT NULL DEFAULT 8,
  cost_per_unit    NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency_code    VARCHAR(3)    NOT NULL DEFAULT 'USD',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resources_project ON project_resources(project_id);

-- Calendar exceptions (non-working days, reduced availability)
CREATE TABLE IF NOT EXISTS project_resource_calendars (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id      UUID          NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  work_date        DATE          NOT NULL,
  available_units  NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_holiday       BOOLEAN       NOT NULL DEFAULT true,
  note             VARCHAR(255),
  UNIQUE(resource_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_cal_resource ON project_resource_calendars(resource_id);

-- Activity-resource assignments
CREATE TABLE IF NOT EXISTS project_activity_resources (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id    UUID          NOT NULL REFERENCES project_activities(id) ON DELETE CASCADE,
  resource_id    UUID          NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  units_per_day  NUMERIC(10,2) NOT NULL DEFAULT 1,
  total_units    NUMERIC(10,2),
  budgeted_cost  NUMERIC(15,2),
  actual_units   NUMERIC(10,2),
  actual_cost    NUMERIC(15,2),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(activity_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_act_res_activity ON project_activity_resources(activity_id);
CREATE INDEX IF NOT EXISTS idx_act_res_resource  ON project_activity_resources(resource_id);
