-- ── MIGRATION 031: USER INVITATIONS, SYSTEM CONFIGURATION, COMPANY FIELDS ──

-- ── USER INVITATIONS ─────────────────────────────────────────────────────────
-- Admins send invitations; invited users click the link, set a password, and activate.
CREATE TABLE IF NOT EXISTS user_invitations (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email            VARCHAR(255) NOT NULL,
  invited_by       UUID        NOT NULL REFERENCES users(id),
  company_id       UUID        REFERENCES companies(id),
  role             VARCHAR(30),
  module           VARCHAR(50),
  token            VARCHAR(255) NOT NULL UNIQUE,
  expires_at       TIMESTAMPTZ  NOT NULL,
  accepted_at      TIMESTAMPTZ,
  created_user_id  UUID        REFERENCES users(id),
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','cancelled')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── SYSTEM CONFIGURATION ─────────────────────────────────────────────────────
-- Company-level defaults set by system_admin / company_admin.
-- One row per company (enforced by UNIQUE on company_id).
CREATE TABLE IF NOT EXISTS system_configuration (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

  -- Fiscal year
  fiscal_year_start_month  INTEGER NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  fiscal_year_start_day    INTEGER NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_day BETWEEN 1 AND 31),

  -- Defaults
  default_currency              CHAR(3)  NOT NULL DEFAULT 'IQD',
  default_payment_terms_days    INTEGER  NOT NULL DEFAULT 30,
  default_po_currency           CHAR(3)  NOT NULL DEFAULT 'IQD',

  -- Iraqi payroll tax configuration
  income_tax_enabled                BOOLEAN      NOT NULL DEFAULT true,
  social_security_rate              NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  employer_social_security_rate     NUMERIC(5,4) NOT NULL DEFAULT 0.12,

  -- Iraqi withholding tax defaults
  default_wht_services_domestic  NUMERIC(5,4) NOT NULL DEFAULT 0.03,
  default_wht_services_foreign   NUMERIC(5,4) NOT NULL DEFAULT 0.15,
  default_wht_construction       NUMERIC(5,4) NOT NULL DEFAULT 0.02,
  default_wht_equipment_rental   NUMERIC(5,4) NOT NULL DEFAULT 0.05,

  -- Company email branding
  company_email_from       VARCHAR(255),
  company_email_signature  TEXT,

  -- Setup tracking
  setup_completed        BOOLEAN NOT NULL DEFAULT false,
  setup_steps_completed  JSONB   NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default config row for every existing company
INSERT INTO system_configuration (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

-- ── ADDITIONAL COMPANY FIELDS ────────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS logo_path           VARCHAR(500),
  ADD COLUMN IF NOT EXISTS phone               VARCHAR(50),
  ADD COLUMN IF NOT EXISTS email               VARCHAR(255),
  ADD COLUMN IF NOT EXISTS website             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vat_number          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address             TEXT,
  ADD COLUMN IF NOT EXISTS postal_code         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_name           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bank_account        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bank_iban           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bank_swift          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS setup_completed     BOOLEAN NOT NULL DEFAULT false;

-- ── USER PREFERENCE COLUMNS ──────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS theme_preference    VARCHAR(20)  DEFAULT 'light',
  ADD COLUMN IF NOT EXISTS date_format         VARCHAR(20)  DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS number_format       VARCHAR(20)  DEFAULT 'en-IQ';

-- Backfill last_login_at from the existing last_login column
UPDATE users SET last_login_at = last_login WHERE last_login_at IS NULL AND last_login IS NOT NULL;

-- ── user_company_roles: add updated_at ───────────────────────────────────────
ALTER TABLE user_company_roles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Allow NULL module (role with no module scope = company-wide)
ALTER TABLE user_company_roles
  ALTER COLUMN module DROP NOT NULL;

-- Drop old unique constraint and replace with one that handles NULL module
ALTER TABLE user_company_roles
  DROP CONSTRAINT IF EXISTS user_company_roles_user_id_company_id_module_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ucr_unique_active
  ON user_company_roles (user_id, company_id, role, COALESCE(module, ''));

-- ── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invitations_token
  ON user_invitations(token)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invitations_email
  ON user_invitations(email, status);
CREATE INDEX IF NOT EXISTS idx_invitations_expires
  ON user_invitations(expires_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_syscfg_company
  ON system_configuration(company_id);
