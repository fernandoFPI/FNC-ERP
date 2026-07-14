-- Migration 123: Planning — WBS, Activities, Dependencies, Baselines

CREATE TABLE IF NOT EXISTS project_wbs (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id     UUID          REFERENCES project_wbs(id) ON DELETE CASCADE,
  wbs_code      VARCHAR(50)   NOT NULL,
  name          VARCHAR(255)  NOT NULL,
  description   TEXT,
  level         INTEGER       NOT NULL DEFAULT 1,
  sequence      INTEGER       NOT NULL DEFAULT 0,
  budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  responsible   VARCHAR(255),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, wbs_code)
);
CREATE INDEX IF NOT EXISTS idx_wbs_project ON project_wbs(project_id);
CREATE INDEX IF NOT EXISTS idx_wbs_parent  ON project_wbs(parent_id);

CREATE TABLE IF NOT EXISTS project_activities (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wbs_id            UUID          REFERENCES project_wbs(id) ON DELETE SET NULL,
  activity_code     VARCHAR(50)   NOT NULL,
  name              VARCHAR(255)  NOT NULL,
  activity_type     VARCHAR(20)   NOT NULL DEFAULT 'task'
                                  CHECK (activity_type IN ('task','milestone','summary')),
  -- Planned schedule
  planned_start     DATE,
  planned_finish    DATE,
  duration_days     INTEGER       NOT NULL DEFAULT 0,
  -- Baseline (locked snapshot)
  baseline_start    DATE,
  baseline_finish   DATE,
  baseline_duration INTEGER,
  -- Actuals
  actual_start      DATE,
  actual_finish     DATE,
  percent_complete  NUMERIC(5,2)  NOT NULL DEFAULT 0
                                  CHECK (percent_complete >= 0 AND percent_complete <= 100),
  -- CPM computed fields
  early_start       DATE,
  early_finish      DATE,
  late_start        DATE,
  late_finish       DATE,
  total_float       INTEGER,
  free_float        INTEGER,
  is_critical       BOOLEAN       NOT NULL DEFAULT false,
  -- Budget / EVM
  budget_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_cost       NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Meta
  responsible       VARCHAR(255),
  location          VARCHAR(255),
  remarks           TEXT,
  sequence          INTEGER       NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, activity_code)
);
CREATE INDEX IF NOT EXISTS idx_activities_project ON project_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_activities_wbs     ON project_activities(wbs_id);

CREATE TABLE IF NOT EXISTS project_activity_dependencies (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_id  UUID        NOT NULL REFERENCES project_activities(id) ON DELETE CASCADE,
  successor_id    UUID        NOT NULL REFERENCES project_activities(id) ON DELETE CASCADE,
  dependency_type VARCHAR(5)  NOT NULL DEFAULT 'FS'
                              CHECK (dependency_type IN ('FS','SS','FF','SF')),
  lag_days        INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(predecessor_id, successor_id)
);
CREATE INDEX IF NOT EXISTS idx_deps_project ON project_activity_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_deps_pred    ON project_activity_dependencies(predecessor_id);
CREATE INDEX IF NOT EXISTS idx_deps_succ    ON project_activity_dependencies(successor_id);

CREATE TABLE IF NOT EXISTS project_baselines (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  baseline_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  is_active         BOOLEAN     NOT NULL DEFAULT false,
  activity_snapshot JSONB,
  created_by        UUID        REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baselines_project ON project_baselines(project_id);
