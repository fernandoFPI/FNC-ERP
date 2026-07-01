-- ── MIGRATION 052: PERSIST ACTIVE COMPANY ON SESSION ────────────────────────
-- Sessions had no record of which company was active. On access-token refresh
-- (every JWT_ACCESS_EXPIRES_IN), the server had to guess the company by
-- picking the user's highest-priority role, silently reverting users back to
-- their "primary" company even after they had switched companies in the UI.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Backfill existing sessions to the user's highest-priority role company,
-- matching the previous (buggy) refresh behavior, so current sessions keep working.
UPDATE sessions s
SET company_id = (
  SELECT ucr.company_id FROM user_company_roles ucr
  WHERE ucr.user_id = s.user_id AND ucr.is_active = true
  ORDER BY CASE ucr.role
    WHEN 'system_admin'  THEN 1
    WHEN 'company_admin' THEN 2
    WHEN 'module_admin'  THEN 3
    ELSE 4
  END
  LIMIT 1
)
WHERE s.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_company ON sessions(company_id);
