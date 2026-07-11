-- ── Project Member Type ────────────────────────────────────────
-- Categorises each project team member as either 'technical' or
-- 'commercial'. Existing members default to 'technical'.

ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS member_type VARCHAR(20) NOT NULL DEFAULT 'technical'
    CHECK (member_type IN ('technical', 'commercial'));

CREATE INDEX IF NOT EXISTS idx_project_members_type
  ON project_members(project_id, member_type)
  WHERE is_active = true;
