-- HR schema: work locations, departments, employees, shifts, attendance, leave, salary configs
-- Note: company_id, user_id etc. are stored as UUID without FK to cross-domain tables.

CREATE TABLE work_locations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL,
  name              VARCHAR(200) NOT NULL,
  address           TEXT,
  latitude          NUMERIC(10, 7),
  longitude         NUMERIC(10, 7),
  geofence_radius_m INTEGER NOT NULL DEFAULT 200,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE departments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  name       VARCHAR(200) NOT NULL,
  parent_id  UUID REFERENCES departments(id),
  manager_id UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employees (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL,
  user_id             UUID,
  employee_number     VARCHAR(50),
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  email               VARCHAR(255),
  phone               VARCHAR(50),
  national_id         VARCHAR(100),
  job_title           VARCHAR(200),
  department_id       UUID REFERENCES departments(id),
  work_location_id    UUID REFERENCES work_locations(id),
  manager_id          UUID REFERENCES employees(id),
  employment_type     VARCHAR(50) NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time','part_time','contract','intern')),
  hire_date           DATE NOT NULL,
  termination_date    DATE,
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','on_leave','terminated')),
  bank_account_encrypted TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, employee_number)
);

ALTER TABLE departments ADD CONSTRAINT fk_dept_manager
  FOREIGN KEY (manager_id) REFERENCES employees(id);

CREATE TABLE shift_configs (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id               UUID NOT NULL,
  name                     VARCHAR(100) NOT NULL,
  start_time               TIME NOT NULL,
  end_time                 TIME NOT NULL,
  break_minutes            INTEGER NOT NULL DEFAULT 60,
  overtime_threshold_hours NUMERIC(4,2) NOT NULL DEFAULT 8,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employee_shifts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id    UUID NOT NULL REFERENCES employees(id),
  shift_id       UUID NOT NULL REFERENCES shift_configs(id),
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE attendance_logs (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id               UUID NOT NULL REFERENCES employees(id),
  company_id                UUID NOT NULL,
  punch_type                VARCHAR(10) NOT NULL CHECK (punch_type IN ('in','out')),
  punched_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude                  NUMERIC(10, 7),
  longitude                 NUMERIC(10, 7),
  distance_from_location_m  NUMERIC(10, 2),
  work_location_id          UUID REFERENCES work_locations(id),
  geofence_valid            BOOLEAN,
  notes                     TEXT,
  created_by                UUID
);

CREATE TABLE leave_types (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL,
  name              VARCHAR(100) NOT NULL,
  is_paid           BOOLEAN NOT NULL DEFAULT TRUE,
  max_days_per_year INTEGER,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE leave_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id   UUID NOT NULL REFERENCES employees(id),
  company_id    UUID NOT NULL,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  total_days    NUMERIC(5,1) NOT NULL,
  reason        TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  created_by    UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
