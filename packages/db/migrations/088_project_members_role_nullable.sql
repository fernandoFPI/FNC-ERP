-- Migration 088: Make project_members.role nullable (role field removed from UI)
ALTER TABLE project_members ALTER COLUMN role DROP NOT NULL;
