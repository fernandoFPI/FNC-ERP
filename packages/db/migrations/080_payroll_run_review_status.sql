-- Add 'review' to payroll_runs status check constraint
ALTER TABLE payroll_runs DROP CONSTRAINT payroll_runs_status_check;
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('draft','processing','review','approved','posted','cancelled'));
