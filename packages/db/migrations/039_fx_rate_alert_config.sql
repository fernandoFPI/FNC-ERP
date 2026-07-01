-- Migration 039: FX rate alert configuration table
-- Stores per-company warn/critical staleness thresholds

CREATE TABLE IF NOT EXISTS fx_rate_alert_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  usd_iqd_alert_pct   NUMERIC(6,2) NOT NULL DEFAULT 2.0,
  eur_iqd_alert_pct   NUMERIC(6,2) NOT NULL DEFAULT 2.5,
  gbp_iqd_alert_pct   NUMERIC(6,2) NOT NULL DEFAULT 3.0,
  warn_rate_hours     INTEGER NOT NULL DEFAULT 12,
  critical_rate_hours INTEGER NOT NULL DEFAULT 24,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID REFERENCES users(id),
  CONSTRAINT fx_warn_lt_critical CHECK (warn_rate_hours < critical_rate_hours),
  CONSTRAINT fx_alert_company_unique UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_fx_rate_alert_config_company ON fx_rate_alert_config(company_id);
