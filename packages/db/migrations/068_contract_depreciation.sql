-- Migration 068: Add depreciation fields to rental_contracts
ALTER TABLE rental_contracts
  ADD COLUMN IF NOT EXISTS depreciation_method  VARCHAR(20) DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line','declining_balance','usage_based','none')),
  ADD COLUMN IF NOT EXISTS depreciation_per_day NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS useful_life_days     INTEGER,
  ADD COLUMN IF NOT EXISTS salvage_value        NUMERIC(20,4);
