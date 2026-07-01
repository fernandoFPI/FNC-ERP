-- Add extra personal/employment fields to employees table
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS passport_number  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nationality      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS date_of_birth    DATE,
  ADD COLUMN IF NOT EXISTS gender           VARCHAR(20);

-- Expand employment_type constraint to include daily/expat/contractor
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employment_type_check;
ALTER TABLE employees ADD CONSTRAINT employees_employment_type_check
  CHECK (employment_type IN ('full_time','part_time','contract','intern','daily','expat','contractor'));
