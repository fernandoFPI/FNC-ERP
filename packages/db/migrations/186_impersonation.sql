-- Migration 186: user impersonation ("login as" for support/debugging).
--
-- system_admin can start a session as any other user without their password
-- or 2FA. impersonated_by records who's really driving; NULL for a normal
-- session. Nullable, no backfill needed for existing rows.

ALTER TABLE sessions ADD COLUMN impersonated_by UUID REFERENCES users(id);

CREATE INDEX idx_sessions_impersonated_by ON sessions(impersonated_by) WHERE impersonated_by IS NOT NULL;
