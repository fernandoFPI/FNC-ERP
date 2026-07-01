-- Migration 066: Fix rental schema gaps
-- Adds columns that resolvers reference but were never in the original migrations.

-- ── equipment_assets ──────────────────────────────────────────────────────────
ALTER TABLE equipment_assets
  ADD COLUMN IF NOT EXISTS description            TEXT,
  ADD COLUMN IF NOT EXISTS purchase_price         NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS maintenance_due_hours  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_hours            NUMERIC(10,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_mileage          NUMERIC(10,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condition_rating       INTEGER
    CHECK (condition_rating IS NULL OR (condition_rating >= 1 AND condition_rating <= 5)),
  ADD COLUMN IF NOT EXISTS last_maintenance_date  DATE,
  ADD COLUMN IF NOT EXISTS maintenance_status     VARCHAR(30)    NOT NULL DEFAULT 'ok'
    CHECK (maintenance_status IN ('ok','due_soon','overdue','in_maintenance'));

-- Backfill purchase_price from purchase_cost where available
UPDATE equipment_assets
SET purchase_price = purchase_cost
WHERE purchase_price IS NULL AND purchase_cost IS NOT NULL;

-- ── rental_contracts ──────────────────────────────────────────────────────────
ALTER TABLE rental_contracts
  ADD COLUMN IF NOT EXISTS asset_id        UUID           REFERENCES equipment_assets(id),
  ADD COLUMN IF NOT EXISTS deposit_amount  NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS notes           TEXT;

-- ── rental_invoices (WHT + paid_at) ──────────────────────────────────────────
ALTER TABLE rental_invoices
  ADD COLUMN IF NOT EXISTS wht_applies  BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wht_scenario VARCHAR(50),
  ADD COLUMN IF NOT EXISTS wht_rate     NUMERIC(6,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount   NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at      TIMESTAMPTZ;

-- ── equipment_usage_logs — add operator_name and company_id ──────────────────
ALTER TABLE equipment_usage_logs
  ADD COLUMN IF NOT EXISTS company_id    UUID          REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS operator_name VARCHAR(255);

-- ── maintenance_schedules — add one-off scheduling columns ───────────────────
ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS status         VARCHAR(20) DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  ADD COLUMN IF NOT EXISTS assigned_to    VARCHAR(255);

-- ── maintenance_records — add performed_date and convenience columns ──────────
ALTER TABLE maintenance_records
  ADD COLUMN IF NOT EXISTS performed_date DATE,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS cost           NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS next_due_date  DATE,
  ADD COLUMN IF NOT EXISTS notes          TEXT;

-- Backfill from existing columns
UPDATE maintenance_records
SET performed_date = completed_at::DATE
WHERE performed_date IS NULL AND completed_at IS NOT NULL;

UPDATE maintenance_records
SET cost = actual_cost
WHERE cost IS NULL AND actual_cost IS NOT NULL;

UPDATE maintenance_records
SET description = findings
WHERE description IS NULL AND findings IS NOT NULL;

-- ── condition_reports — simple table for the app's condition report model ─────
CREATE TABLE IF NOT EXISTS condition_reports (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID          REFERENCES companies(id),
  asset_id    UUID          NOT NULL REFERENCES equipment_assets(id) ON DELETE CASCADE,
  report_date DATE          NOT NULL DEFAULT CURRENT_DATE,
  rating      INTEGER       NOT NULL CHECK (rating >= 1 AND rating <= 5),
  checklist   JSONB,
  notes       TEXT,
  gps_lat     NUMERIC(10,7),
  gps_lng     NUMERIC(10,7),
  created_by  UUID          REFERENCES users(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_condition_reports_asset
  ON condition_reports(asset_id, created_at DESC);
