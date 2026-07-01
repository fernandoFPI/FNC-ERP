-- Migration 067: Allow multiple usage log entries per asset per day
-- The UNIQUE(asset_id, log_date) constraint is too strict — an asset can
-- have multiple operating sessions in one day (different shifts/operators).
-- Drop the unique constraint; keep a regular index for query performance.

ALTER TABLE equipment_usage_logs
  DROP CONSTRAINT IF EXISTS equipment_usage_logs_asset_id_log_date_key;

-- Replace with a plain index (already had idx_usage_logs_asset from 029, but drop+recreate to be safe)
DROP INDEX IF EXISTS idx_usage_logs_asset;
CREATE INDEX IF NOT EXISTS idx_equipment_usage_logs_asset_date
  ON equipment_usage_logs(asset_id, log_date DESC);
