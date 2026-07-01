-- ============================================================
-- Platform schema — core identity tables
-- ============================================================

CREATE TABLE companies (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(255) NOT NULL,
  legal_name   VARCHAR(255) NOT NULL,
  country_code CHAR(2)      NOT NULL DEFAULT 'IQ',
  currency_code CHAR(3)     NOT NULL DEFAULT 'IQD',
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                 VARCHAR(255) NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  mfa_enabled           BOOLEAN      NOT NULL DEFAULT false,
  mfa_secret            VARCHAR(255),
  device_fingerprint    VARCHAR(500),
  failed_login_attempts INTEGER      NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login            TIMESTAMPTZ,
  is_active             BOOLEAN      NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE user_company_roles (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role        VARCHAR(50) NOT NULL,
  module      VARCHAR(50) NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, company_id, module)
);

CREATE TABLE sessions (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash          VARCHAR(255) NOT NULL,
  refresh_token_hash  VARCHAR(255) NOT NULL,
  device_id           VARCHAR(255),
  device_name         VARCHAR(255),
  platform            VARCHAR(20)  NOT NULL DEFAULT 'web',
  ip_address          INET,
  user_agent          TEXT,
  expires_at          TIMESTAMPTZ  NOT NULL,
  refresh_expires_at  TIMESTAMPTZ  NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID         REFERENCES users(id)     ON DELETE SET NULL,
  company_id  UUID         REFERENCES companies(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  table_name  VARCHAR(100),
  record_id   UUID,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
