-- Per-event email routing config: allows admins to silence specific notification emails
-- without touching code. Security emails (password reset, new device login, etc.) are
-- handled in code and intentionally excluded from this table.
CREATE TABLE IF NOT EXISTS notification_routing (
  key           TEXT        PRIMARY KEY,
  email_enabled BOOLEAN     NOT NULL DEFAULT true,
  description   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID        REFERENCES users(id) ON DELETE SET NULL
);
