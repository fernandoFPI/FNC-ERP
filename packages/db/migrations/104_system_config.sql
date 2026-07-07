-- 104_system_config
-- Operator-configurable system settings stored in the database.
-- Sensitive values (passwords, API keys) are AES-256-GCM encrypted using ENCRYPTION_KEY.

CREATE TABLE IF NOT EXISTS system_config (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL DEFAULT '',
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE system_config IS 'Operator-editable settings; sensitive values stored encrypted';
