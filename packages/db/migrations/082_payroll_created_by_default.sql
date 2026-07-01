-- Ensure created_by is nullable AND has a fallback default so old gateway code can insert without it
ALTER TABLE payroll_runs ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE payroll_runs ALTER COLUMN created_by SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;
