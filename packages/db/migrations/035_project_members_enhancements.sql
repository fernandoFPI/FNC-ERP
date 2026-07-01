-- Add missing columns to project_members (table existed before migration 033)
ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add employee FK if missing (was "no FK" in original schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'project_members_employee_id_fkey'
    AND table_name = 'project_members'
  ) THEN
    ALTER TABLE project_members
      ADD CONSTRAINT project_members_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure project_stages has completion_pct (may have only completion_percentage)
ALTER TABLE project_stages
  ADD COLUMN IF NOT EXISTS completion_pct INTEGER NOT NULL DEFAULT 0
    CHECK (completion_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS notes TEXT;
