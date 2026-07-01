-- ── STEP 1: Drop old status constraint ────────────────────────
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

-- ── STEP 2: Migrate existing data BEFORE adding new constraint ─
UPDATE projects SET status = 'pending'
  WHERE status IN ('draft');
UPDATE projects SET status = 'ongoing'
  WHERE status IN ('active');
UPDATE projects SET status = 'on_hold'
  WHERE status IN ('hold');
UPDATE projects SET status = 'completed'
  WHERE status IN ('closed');

-- ── STEP 3: Add new status constraint ─────────────────────────
ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'pending',
    'ongoing',
    'submitted',
    'approved',
    'completed',
    'cancelled',
    'cancelled_after_approval',
    'on_hold'
  ));

-- ── STEP 4: New project fields ────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS rfq_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contract_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS project_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS receiving_date DATE,
  ADD COLUMN IF NOT EXISTS submission_date DATE,
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS project_value NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS project_value_currency CHAR(3)
    NOT NULL DEFAULT 'IQD',
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- ── STEP 5: Project stages enhancements ───────────────────────
ALTER TABLE project_stages
  ADD COLUMN IF NOT EXISTS completion_pct INTEGER
    NOT NULL DEFAULT 0
    CHECK (completion_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_end_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── STEP 6: Project members — ensure table exists ─────────────
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role VARCHAR(100),
  allocated_hours INTEGER,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, employee_id)
);

-- ── STEP 7: Project status history ────────────────────────────
CREATE TABLE IF NOT EXISTS project_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  changed_by UUID NOT NULL REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── STEP 8: Indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_status_company
  ON projects(company_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_manager
  ON projects(project_manager_id)
  WHERE project_manager_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_analytic
  ON projects(analytic_account_id)
  WHERE analytic_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_stages_project
  ON project_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project
  ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_employee
  ON project_members(employee_id);
CREATE INDEX IF NOT EXISTS idx_project_status_history_project
  ON project_status_history(project_id);
CREATE INDEX IF NOT EXISTS idx_project_status_history_created
  ON project_status_history USING BRIN (created_at);
