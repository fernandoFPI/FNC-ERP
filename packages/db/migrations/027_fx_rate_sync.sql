-- ── FX RATE SYNC LOG ──────────────────────────────────────────
-- Records every sync attempt — successful or failed.
-- Both scheduled and manual syncs are logged here.
CREATE TABLE fx_rate_sync_log (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type         VARCHAR(20) NOT NULL
    CHECK (sync_type IN ('scheduled','manual','fallback')),
  triggered_by      UUID REFERENCES users(id),
    -- NULL for scheduled jobs
  source            VARCHAR(50) NOT NULL,
    -- 'exchangerate_api', 'open_exchange_rates', 'manual', 'fallback', 'unknown'
  status            VARCHAR(20) NOT NULL
    CHECK (status IN ('success','partial','failed')),
  rates_fetched     JSONB,
    -- [{ fromCurrency, toCurrency, rate, rateDate, source }]
  rates_updated     INTEGER     NOT NULL DEFAULT 0,
  rates_skipped     INTEGER     NOT NULL DEFAULT 0,
    -- skipped when rate for that date already exists
  error_message     TEXT,
  duration_ms       INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── FX RATE CHANGE AUDIT ──────────────────────────────────────
-- Every rate insert is audited here for finance review.
-- Provides a clean rate history distinct from the raw audit_log.
CREATE TABLE fx_rate_changes (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency   CHAR(3)     NOT NULL,
  to_currency     CHAR(3)     NOT NULL,
  rate_date       DATE        NOT NULL,
  rate            NUMERIC(20,6) NOT NULL,
  previous_rate   NUMERIC(20,6),
    -- most recent rate for this pair before this insert
  change_pct      NUMERIC(8,4),
    -- percentage change vs previous_rate; NULL if no prior rate
  source          VARCHAR(50) NOT NULL,
  sync_log_id     UUID REFERENCES fx_rate_sync_log(id),
  entered_by      UUID REFERENCES users(id),
    -- NULL for automated syncs
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── FX RATE ALERT THRESHOLDS ──────────────────────────────────
-- Finance admin configures how stale rates can be before alerting
-- and what rate movement triggers a manual review flag.
CREATE TABLE fx_rate_alert_config (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID        NOT NULL UNIQUE REFERENCES companies(id),
  -- Staleness thresholds
  warn_after_hours        INTEGER     NOT NULL DEFAULT 48,
  critical_after_hours    INTEGER     NOT NULL DEFAULT 96,
  -- Movement threshold — alert if daily rate moves more than this %
  large_movement_pct      NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  -- Notification targets
  notify_finance_admins   BOOLEAN     NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default config for every company
INSERT INTO fx_rate_alert_config (company_id, warn_after_hours, critical_after_hours)
SELECT id, 48, 96 FROM companies;

-- ── EXTEND fx_rates WITH TRACKING COLUMNS ─────────────────────
ALTER TABLE fx_rates
  ADD COLUMN IF NOT EXISTS is_verified  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sync_log_id  UUID REFERENCES fx_rate_sync_log(id);

-- ── INDEXES ────────────────────────────────────────────────────
CREATE INDEX idx_fx_sync_log_created  ON fx_rate_sync_log(created_at DESC);
CREATE INDEX idx_fx_sync_log_status   ON fx_rate_sync_log(status, created_at DESC);

CREATE INDEX idx_fx_rate_changes_pair ON fx_rate_changes(from_currency, to_currency, rate_date DESC);
CREATE INDEX idx_fx_rate_changes_date ON fx_rate_changes(created_at DESC);

CREATE INDEX idx_fx_alert_config_co   ON fx_rate_alert_config(company_id);
