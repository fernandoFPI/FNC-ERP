-- completion_pct (INTEGER, migration 033) supersedes completion_percentage (NUMERIC, migration 016).
-- All code references have been migrated to completion_pct before this migration.
ALTER TABLE project_stages DROP COLUMN IF EXISTS completion_percentage;
