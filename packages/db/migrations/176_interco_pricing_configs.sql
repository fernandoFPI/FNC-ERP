-- 176_interco_pricing_configs
-- Per-company current inter-company transfer pricing settings.
-- interco_pricing_config_log (migration 023) already records the change
-- history, but nothing ever created a table for the *current* setting it
-- was logging changes against — services/gateway's companyIntercoPricingSettings
-- / updateIntercoPricing resolvers have referenced this table since it was
-- written; it was never migrated.

CREATE TABLE interco_pricing_configs (
  company_id            UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  method                VARCHAR(20) NOT NULL DEFAULT 'avco'
    CHECK (method IN ('avco', 'cost_plus', 'market', 'standard')),
  cost_plus_markup_pct  NUMERIC(5,4),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID REFERENCES users(id)
);
