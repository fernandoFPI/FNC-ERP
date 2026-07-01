-- Consolidate 4 WHT category defaults into a single default_wht_rate column.
-- The category columns were display-only; no invoice logic read them.
ALTER TABLE system_configuration
  DROP COLUMN IF EXISTS default_wht_services_domestic,
  DROP COLUMN IF EXISTS default_wht_services_foreign,
  DROP COLUMN IF EXISTS default_wht_construction,
  DROP COLUMN IF EXISTS default_wht_equipment_rental,
  ADD COLUMN IF NOT EXISTS default_wht_rate NUMERIC(5,4) NOT NULL DEFAULT 0.03;
