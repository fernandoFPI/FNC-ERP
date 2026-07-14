-- Migration 136: Allow project team members to be assigned to both technical and commercial teams
ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_member_type_check;
ALTER TABLE project_members ADD CONSTRAINT project_members_member_type_check
  CHECK (member_type IN ('technical', 'commercial', 'both'));
