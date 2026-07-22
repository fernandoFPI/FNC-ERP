-- Migration 173: company-wide "hide Risk Register tab" toggle.
-- Default true — Risk Register is currently unused, hide it immediately for
-- every company; an admin can turn it back on from Settings > Company >
-- Lifecycle without a code change. Same mechanism as bid_simple_mode_enabled
-- (migration 172): a system_configuration flag surfaced via LifecycleConfig.

ALTER TABLE system_configuration
  ADD COLUMN IF NOT EXISTS hide_risk_register BOOLEAN NOT NULL DEFAULT true;
