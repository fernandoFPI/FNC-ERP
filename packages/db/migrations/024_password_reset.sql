-- Password reset tokens are stored in Redis with TTL — not in DB.
-- This table is a security audit log only.
CREATE TABLE password_reset_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  action VARCHAR(30) NOT NULL
    CHECK (action IN ('requested','completed','expired','invalid_token')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pwd_reset_audit_user ON password_reset_audit(user_id, created_at DESC);
CREATE INDEX idx_pwd_reset_audit_email ON password_reset_audit(email, created_at DESC);
CREATE INDEX idx_pwd_reset_audit_brin ON password_reset_audit USING BRIN(created_at);
