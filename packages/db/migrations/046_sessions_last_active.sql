-- Migration 046: Add last_active column to sessions table
-- Tracks when a session was last used (updated on token refresh)

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill existing rows to created_at so they don't show epoch
UPDATE sessions SET last_active = created_at WHERE last_active = '1970-01-01 00:00:00+00';
