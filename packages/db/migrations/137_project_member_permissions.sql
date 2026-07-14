-- Migration 137: Per-member project permission overrides
-- Overrides the role-based defaults (technical/commercial/both/pm) per tab per member.
-- access_level: 'none' = hidden, 'view' = read-only, 'edit' = full edit

CREATE TABLE IF NOT EXISTS project_member_permissions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id    UUID        NOT NULL REFERENCES project_members(id) ON DELETE CASCADE,
  tab_key      VARCHAR(50) NOT NULL,
  access_level VARCHAR(10) NOT NULL DEFAULT 'view'
               CHECK (access_level IN ('none', 'view', 'edit')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, tab_key)
);

CREATE INDEX IF NOT EXISTS idx_member_perms_member ON project_member_permissions(member_id);
