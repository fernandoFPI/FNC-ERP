-- Payroll schema: salary configs (versioned), payroll runs, payslips, overtime logs

CREATE TABLE salary_configs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id         UUID NOT NULL REFERENCES employees(id),
  company_id          UUID NOT NULL,
  base_salary         NUMERIC(15, 4) NOT NULL CHECK (base_salary >= 0),
  currency_code       VARCHAR(3) NOT NULL DEFAULT 'IQD',
  housing_allowance   NUMERIC(15, 4) NOT NULL DEFAULT 0,
  transport_allowance NUMERIC(15, 4) NOT NULL DEFAULT 0,
  other_allowances    NUMERIC(15, 4) NOT NULL DEFAULT 0,
  income_tax_pct      NUMERIC(5, 4) NOT NULL DEFAULT 0,
  social_security_pct NUMERIC(5, 4) NOT NULL DEFAULT 0,
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_salary_config_active
  ON salary_configs (employee_id)
  WHERE effective_to IS NULL;

CREATE TABLE payroll_runs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL,
  period_name      VARCHAR(50) NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','processing','approved','posted','cancelled')),
  total_gross      NUMERIC(18, 4),
  total_net        NUMERIC(18, 4),
  total_deductions NUMERIC(18, 4),
  journal_entry_id UUID,
  processed_by     UUID,
  approved_by      UUID,
  posted_by        UUID,
  created_by       UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, period_name)
);

CREATE TABLE payslips (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_run_id      UUID NOT NULL REFERENCES payroll_runs(id),
  employee_id         UUID NOT NULL REFERENCES employees(id),
  company_id          UUID NOT NULL,
  base_salary         NUMERIC(15, 4) NOT NULL,
  housing_allowance   NUMERIC(15, 4) NOT NULL DEFAULT 0,
  transport_allowance NUMERIC(15, 4) NOT NULL DEFAULT 0,
  other_allowances    NUMERIC(15, 4) NOT NULL DEFAULT 0,
  overtime_hours      NUMERIC(8, 2) NOT NULL DEFAULT 0,
  overtime_pay        NUMERIC(15, 4) NOT NULL DEFAULT 0,
  gross_salary        NUMERIC(15, 4) NOT NULL,
  income_tax          NUMERIC(15, 4) NOT NULL DEFAULT 0,
  social_security     NUMERIC(15, 4) NOT NULL DEFAULT 0,
  other_deductions    NUMERIC(15, 4) NOT NULL DEFAULT 0,
  net_salary          NUMERIC(15, 4) NOT NULL,
  currency_code       VARCHAR(3) NOT NULL DEFAULT 'IQD',
  working_days        INTEGER,
  absent_days         INTEGER NOT NULL DEFAULT 0,
  leave_days          NUMERIC(5,1) NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_run_id, employee_id)
);

CREATE TABLE overtime_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id    UUID NOT NULL REFERENCES employees(id),
  company_id     UUID NOT NULL,
  work_date      DATE NOT NULL,
  regular_hours  NUMERIC(5, 2) NOT NULL,
  overtime_hours NUMERIC(5, 2) NOT NULL DEFAULT 0,
  shift_id       UUID REFERENCES shift_configs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, work_date)
);
