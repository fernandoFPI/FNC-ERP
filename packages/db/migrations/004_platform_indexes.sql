-- ============================================================
-- Indexes for performance — platform tables
-- ============================================================

-- users
CREATE UNIQUE INDEX idx_users_email    ON users(email);
CREATE INDEX idx_users_is_active       ON users(is_active) WHERE is_active = true;

-- user_company_roles
CREATE INDEX idx_ucr_user_company        ON user_company_roles(user_id, company_id);
CREATE INDEX idx_ucr_user_company_module ON user_company_roles(user_id, company_id, module);
CREATE INDEX idx_ucr_company             ON user_company_roles(company_id);

-- sessions
CREATE UNIQUE INDEX idx_sessions_token_hash   ON sessions(token_hash);
CREATE UNIQUE INDEX idx_sessions_refresh_hash ON sessions(refresh_token_hash);
CREATE INDEX idx_sessions_user                ON sessions(user_id);
CREATE INDEX idx_sessions_expires             ON sessions(expires_at);

-- audit_log (append-only — BRIN is efficient for time-range scans)
CREATE INDEX idx_audit_company_created ON audit_log(company_id, created_at DESC);
CREATE INDEX idx_audit_user_created    ON audit_log(user_id,    created_at DESC);
CREATE INDEX idx_audit_table_name      ON audit_log(table_name);
CREATE INDEX idx_audit_record          ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_created_brin    ON audit_log USING BRIN(created_at);
