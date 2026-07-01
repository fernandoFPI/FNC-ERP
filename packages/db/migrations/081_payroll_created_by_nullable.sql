-- Make created_by nullable so existing gateway code doesn't fail while restarting
ALTER TABLE payroll_runs ALTER COLUMN created_by DROP NOT NULL;
