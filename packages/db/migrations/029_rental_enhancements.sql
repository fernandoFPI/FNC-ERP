-- ── EQUIPMENT USAGE LOGS ─────────────────────────────────────
CREATE TABLE equipment_usage_logs (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id              UUID          NOT NULL REFERENCES equipment_assets(id) ON DELETE CASCADE,
  contract_id           UUID          REFERENCES rental_contracts(id),
  project_id            UUID          REFERENCES projects(id),
  log_date              DATE          NOT NULL,
  hours_operated        NUMERIC(6,2)  NOT NULL DEFAULT 0
    CHECK (hours_operated >= 0 AND hours_operated <= 24),
  fuel_consumed_liters  NUMERIC(8,2),
  odometer_km           NUMERIC(10,2),
  engine_hours          NUMERIC(10,2),
  recorded_by           UUID          NOT NULL REFERENCES users(id),
  recorded_via          VARCHAR(20)   NOT NULL DEFAULT 'mobile'
    CHECK (recorded_via IN ('mobile','web','import')),
  notes                 TEXT,
  is_verified           BOOLEAN       NOT NULL DEFAULT false,
  verified_by           UUID          REFERENCES users(id),
  verified_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id, log_date)
);

-- ── MAINTENANCE SCHEDULES ─────────────────────────────────────
CREATE TABLE maintenance_schedules (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id            UUID          NOT NULL REFERENCES equipment_assets(id) ON DELETE CASCADE,
  company_id          UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                VARCHAR(255)  NOT NULL,
  maintenance_type    VARCHAR(50)   NOT NULL
    CHECK (maintenance_type IN (
      'oil_change','filter_replacement','inspection',
      'tyre_service','hydraulic_service','electrical_check',
      'full_service','annual_certification','custom'
    )),
  trigger_type        VARCHAR(20)   NOT NULL DEFAULT 'hours_based'
    CHECK (trigger_type IN ('hours_based','calendar','both')),
  interval_hours      NUMERIC(8,2),
  interval_days       INTEGER,
  warn_before_hours   NUMERIC(6,2)  DEFAULT 20,
  warn_before_days    INTEGER       DEFAULT 7,
  estimated_cost      NUMERIC(20,4),
  currency_code       CHAR(3)       NOT NULL DEFAULT 'IQD',
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── MAINTENANCE RECORDS ───────────────────────────────────────
CREATE TABLE maintenance_records (
  id                        UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id                  UUID          NOT NULL REFERENCES equipment_assets(id) ON DELETE CASCADE,
  schedule_id               UUID          REFERENCES maintenance_schedules(id),
  company_id                UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status                    VARCHAR(20)   NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','cancelled','overdue')),
  due_date                  DATE,
  due_at_engine_hours       NUMERIC(10,2),
  started_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  engine_hours_at_service   NUMERIC(10,2),
  actual_cost               NUMERIC(20,4),
  currency_code             CHAR(3)       NOT NULL DEFAULT 'IQD',
  performed_by              VARCHAR(255),
  performed_by_external     BOOLEAN       NOT NULL DEFAULT false,
  purchase_order_id         UUID          REFERENCES purchase_orders(id),
  findings                  TEXT,
  parts_replaced            TEXT,
  next_service_notes        TEXT,
  service_report_path       VARCHAR(500),
  downtime_hours            NUMERIC(6,2),
  created_by                UUID          NOT NULL REFERENCES users(id),
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── EQUIPMENT LOCATION HISTORY ────────────────────────────────
CREATE TABLE equipment_location_history (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id            UUID          NOT NULL REFERENCES equipment_assets(id) ON DELETE CASCADE,
  stock_location_id   UUID          REFERENCES stock_locations(id),
  project_id          UUID          REFERENCES projects(id),
  gps_lat             NUMERIC(10,7),
  gps_lng             NUMERIC(10,7),
  gps_accuracy_meters INTEGER,
  location_name       VARCHAR(255),
  movement_type       VARCHAR(30)   NOT NULL
    CHECK (movement_type IN (
      'deployed','returned','relocated',
      'maintenance_in','maintenance_out'
    )),
  recorded_by         UUID          NOT NULL REFERENCES users(id),
  recorded_via        VARCHAR(20)   NOT NULL DEFAULT 'web'
    CHECK (recorded_via IN ('web','mobile','system')),
  notes               TEXT,
  effective_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── EQUIPMENT CONDITION REPORTS ───────────────────────────────
CREATE TABLE equipment_condition_reports (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id              UUID          NOT NULL REFERENCES equipment_assets(id) ON DELETE CASCADE,
  project_id            UUID          REFERENCES projects(id),
  reported_by           UUID          NOT NULL REFERENCES users(id),
  reported_via          VARCHAR(20)   NOT NULL DEFAULT 'mobile',
  overall_condition     VARCHAR(20)   NOT NULL
    CHECK (overall_condition IN ('good','fair','poor','critical')),
  checklist             JSONB         NOT NULL DEFAULT '[]',
  issues_found          TEXT,
  gps_lat               NUMERIC(10,7),
  gps_lng               NUMERIC(10,7),
  photo_file_ids        JSONB         NOT NULL DEFAULT '[]',
  status                VARCHAR(20)   NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','action_taken','closed')),
  reviewed_by           UUID          REFERENCES users(id),
  reviewed_at           TIMESTAMPTZ,
  action_taken          TEXT,
  maintenance_record_id UUID          REFERENCES maintenance_records(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── ASSET CUMULATIVE STATS ────────────────────────────────────
CREATE TABLE equipment_asset_stats (
  id                              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id                        UUID          NOT NULL UNIQUE REFERENCES equipment_assets(id) ON DELETE CASCADE,
  total_hours_operated            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_fuel_liters               NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_rental_days               INTEGER       NOT NULL DEFAULT 0,
  last_usage_date                 DATE,
  last_location_update            TIMESTAMPTZ,
  last_maintenance_at             TIMESTAMPTZ,
  last_maintenance_engine_hours   NUMERIC(10,2),
  next_maintenance_due_date       DATE,
  next_maintenance_due_hours      NUMERIC(10,2),
  next_maintenance_schedule_id    UUID          REFERENCES maintenance_schedules(id),
  maintenance_status              VARCHAR(20)   NOT NULL DEFAULT 'ok'
    CHECK (maintenance_status IN ('ok','due_soon','overdue','in_maintenance')),
  updated_at                      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed stats row for all existing assets
INSERT INTO equipment_asset_stats (asset_id)
SELECT id FROM equipment_assets
ON CONFLICT (asset_id) DO NOTHING;

-- ── TRIGGER: accumulate usage stats ──────────────────────────
CREATE OR REPLACE FUNCTION update_asset_stats_on_usage()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO equipment_asset_stats
    (asset_id, total_hours_operated, total_fuel_liters, last_usage_date, updated_at)
  VALUES (
    NEW.asset_id,
    NEW.hours_operated,
    COALESCE(NEW.fuel_consumed_liters, 0),
    NEW.log_date,
    NOW()
  )
  ON CONFLICT (asset_id) DO UPDATE SET
    total_hours_operated = equipment_asset_stats.total_hours_operated + NEW.hours_operated,
    total_fuel_liters    = equipment_asset_stats.total_fuel_liters
                           + COALESCE(NEW.fuel_consumed_liters, 0),
    last_usage_date      = GREATEST(equipment_asset_stats.last_usage_date, NEW.log_date),
    updated_at           = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_asset_stats_usage
  AFTER INSERT OR UPDATE ON equipment_usage_logs
  FOR EACH ROW EXECUTE FUNCTION update_asset_stats_on_usage();

-- ── TRIGGER: recalculate next maintenance after stats change ──
CREATE OR REPLACE FUNCTION recalculate_next_maintenance()
RETURNS TRIGGER AS $$
DECLARE
  v_schedule  maintenance_schedules%ROWTYPE;
  v_last      maintenance_records%ROWTYPE;
  v_next_hours NUMERIC;
  v_next_date  DATE;
  v_schedule_id UUID;
BEGIN
  v_next_hours  := NULL;
  v_next_date   := NULL;
  v_schedule_id := NULL;

  FOR v_schedule IN
    SELECT * FROM maintenance_schedules
    WHERE asset_id = NEW.asset_id AND is_active = true
    ORDER BY COALESCE(interval_hours, 999999) ASC
  LOOP
    SELECT * INTO v_last
    FROM maintenance_records
    WHERE asset_id = NEW.asset_id
      AND schedule_id = v_schedule.id
      AND status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 1;

    IF v_schedule.trigger_type IN ('hours_based','both')
       AND v_schedule.interval_hours IS NOT NULL THEN
      v_next_hours  := COALESCE(v_last.engine_hours_at_service, 0)
                       + v_schedule.interval_hours;
      v_schedule_id := v_schedule.id;
    END IF;

    IF v_schedule.trigger_type IN ('calendar','both')
       AND v_schedule.interval_days IS NOT NULL THEN
      v_next_date   := COALESCE(v_last.completed_at::DATE, CURRENT_DATE)
                       + v_schedule.interval_days;
      v_schedule_id := v_schedule.id;
    END IF;

    -- Use earliest-triggering schedule
    EXIT WHEN v_next_hours IS NOT NULL OR v_next_date IS NOT NULL;
  END LOOP;

  UPDATE equipment_asset_stats
  SET next_maintenance_due_hours   = v_next_hours,
      next_maintenance_due_date    = v_next_date,
      next_maintenance_schedule_id = v_schedule_id,
      updated_at                   = NOW()
  WHERE asset_id = NEW.asset_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_maintenance
  AFTER INSERT OR UPDATE ON equipment_asset_stats
  FOR EACH ROW EXECUTE FUNCTION recalculate_next_maintenance();

-- ── Extend offline_action_log for new mobile actions ─────────
ALTER TABLE offline_action_log
  DROP CONSTRAINT IF EXISTS offline_action_log_action_type_check;
ALTER TABLE offline_action_log
  ADD CONSTRAINT offline_action_log_action_type_check
  CHECK (action_type IN (
    'punch_in',
    'punch_out',
    'approve_overtime',
    'reject_overtime',
    'approve_leave',
    'reject_leave',
    'create_material_issue',
    'submit_usage_log',
    'submit_condition_report'
  ));

-- ── INDEXES ───────────────────────────────────────────────────
CREATE UNIQUE INDEX idx_usage_logs_asset_date
  ON equipment_usage_logs(asset_id, log_date);
CREATE INDEX idx_usage_logs_contract
  ON equipment_usage_logs(contract_id, log_date DESC);
CREATE INDEX idx_usage_logs_project
  ON equipment_usage_logs(project_id, log_date DESC);
CREATE INDEX idx_usage_logs_unverified
  ON equipment_usage_logs(is_verified, log_date DESC)
  WHERE is_verified = false;

CREATE INDEX idx_maintenance_schedules_asset
  ON maintenance_schedules(asset_id);
CREATE INDEX idx_maintenance_schedules_active
  ON maintenance_schedules(asset_id, is_active)
  WHERE is_active = true;

CREATE INDEX idx_maintenance_records_asset
  ON maintenance_records(asset_id, status);
CREATE INDEX idx_maintenance_records_due
  ON maintenance_records(due_date, status)
  WHERE status IN ('scheduled','overdue');
CREATE INDEX idx_maintenance_records_schedule
  ON maintenance_records(schedule_id, completed_at DESC);

CREATE INDEX idx_location_history_asset
  ON equipment_location_history(asset_id, effective_at DESC);
CREATE INDEX idx_location_history_project
  ON equipment_location_history(project_id, effective_at DESC);

CREATE INDEX idx_condition_reports_asset
  ON equipment_condition_reports(asset_id, created_at DESC);
CREATE INDEX idx_condition_reports_open
  ON equipment_condition_reports(status, created_at DESC)
  WHERE status IN ('open','acknowledged');
CREATE INDEX idx_condition_reports_project
  ON equipment_condition_reports(project_id, created_at DESC);

CREATE INDEX idx_asset_stats_maintenance_status
  ON equipment_asset_stats(maintenance_status)
  WHERE maintenance_status IN ('due_soon','overdue');
CREATE INDEX idx_asset_stats_next_due
  ON equipment_asset_stats(next_maintenance_due_date)
  WHERE next_maintenance_due_date IS NOT NULL;
