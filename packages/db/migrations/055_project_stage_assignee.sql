-- ── MIGRATION 055: STAGE ASSIGNEE ──────────────────────────────────────────
-- Allow a project team member (employee) to be assigned responsibility for
-- a stage: its status, actual start/end dates, and completion percentage.

ALTER TABLE project_stages
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL;
