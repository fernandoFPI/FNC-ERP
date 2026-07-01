-- ── PROJECTS ──────────────────────────────────────────────────
-- All cross-epoch refs (analytic_accounts, cost_centers, employees, journal_lines,
-- journal_entries, chart_of_accounts) stored as plain UUID — fnc_app lacks
-- REFERENCES privilege on pre-existing tables in both DBs.
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  project_type VARCHAR(30) NOT NULL DEFAULT 'construction'
    CHECK (project_type IN ('construction','epc','manufacturing','rental','internal')),
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft','pending','active','on_hold','submitted',
      'completed','closed','cancelled'
    )),
  client_name VARCHAR(255),
  client_contact TEXT,
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  budget_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  budget_currency CHAR(3) NOT NULL DEFAULT 'IQD',
  analytic_account_id UUID,   -- no FK; ref to analytic_accounts
  cost_center_id UUID,        -- no FK; ref to cost_centers
  project_manager_id UUID,    -- no FK; ref to employees
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- ── PROJECT STAGES ─────────────────────────────────────────────
CREATE TABLE project_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  completion_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (completion_percentage BETWEEN 0 AND 100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROJECT TEAM MEMBERS ───────────────────────────────────────
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,   -- no FK; ref to employees
  role VARCHAR(100) NOT NULL,
  allocated_hours NUMERIC(8,2),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, employee_id)
);

-- ── PROJECT BUDGET LINES ───────────────────────────────────────
CREATE TABLE project_budget_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  account_id UUID,             -- no FK; ref to chart_of_accounts
  budgeted_amount NUMERIC(20,4) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROJECT COST ACTUALS ───────────────────────────────────────
CREATE TABLE project_cost_actuals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  journal_line_id UUID NOT NULL UNIQUE,  -- no FK; ref to journal_lines
  cost_category VARCHAR(100),
  amount NUMERIC(20,4) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  entry_date DATE NOT NULL,
  source_type VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TRIGGER: sync journal line costs to project_cost_actuals ───
CREATE OR REPLACE FUNCTION sync_project_cost_actuals()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id UUID;
  v_entry_date DATE;
  v_source_type VARCHAR(50);
BEGIN
  IF NEW.analytic_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_project_id
  FROM analytic_accounts aa
  JOIN projects p ON p.analytic_account_id = aa.id
  WHERE aa.id = NEW.analytic_account_id;

  IF v_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT entry_date, source_type INTO v_entry_date, v_source_type
  FROM journal_entries WHERE id = NEW.journal_entry_id;

  INSERT INTO project_cost_actuals
    (project_id, journal_line_id, amount, currency_code, entry_date, source_type)
  VALUES
    (v_project_id, NEW.id,
     NEW.debit - NEW.credit,
     NEW.currency_code, v_entry_date, v_source_type)
  ON CONFLICT (journal_line_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_project_costs
  AFTER INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION sync_project_cost_actuals();
