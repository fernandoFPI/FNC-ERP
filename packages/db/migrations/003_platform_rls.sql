-- ============================================================
-- Row-Level Security policies for company isolation
-- ============================================================

-- Enable RLS
ALTER TABLE user_company_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;

-- Application role (not superuser — cannot bypass RLS)
-- Password should be overridden in production via environment / vault
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fnc_app') THEN
    CREATE ROLE fnc_app LOGIN PASSWORD 'change_in_production';
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO fnc_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO fnc_app;

-- user_company_roles: visible only for the currently active company
-- system_admin bypasses to see all
CREATE POLICY company_isolation ON user_company_roles
  AS PERMISSIVE FOR ALL
  USING (
    company_id = current_setting('app.current_company_id', true)::uuid
    OR current_setting('app.current_role', true) = 'system_admin'
  );

-- sessions: each user sees only their own sessions
CREATE POLICY session_isolation ON sessions
  AS PERMISSIVE FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
  );

-- audit_log: company-scoped reads; system_admin sees all
CREATE POLICY audit_isolation ON audit_log
  AS PERMISSIVE FOR ALL
  USING (
    company_id = current_setting('app.current_company_id', true)::uuid
    OR current_setting('app.current_role', true) = 'system_admin'
  );
