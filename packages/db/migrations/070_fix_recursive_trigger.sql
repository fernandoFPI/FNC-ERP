-- Migration 070: Fix infinite recursion in recalculate_next_maintenance trigger
--
-- Chain: INSERT equipment_usage_logs
--   → trg_update_asset_stats_usage  → UPSERT equipment_asset_stats
--   → trg_recalc_maintenance        → UPDATE equipment_asset_stats
--   → trg_recalc_maintenance        → UPDATE equipment_asset_stats  (infinite loop)
--
-- Fix: only UPDATE when the computed values differ from what is already stored.
-- If nothing changes, no UPDATE fires, no trigger fires, recursion stops.

CREATE OR REPLACE FUNCTION recalculate_next_maintenance()
RETURNS TRIGGER AS $$
DECLARE
  v_schedule        maintenance_schedules%ROWTYPE;
  v_last            maintenance_records%ROWTYPE;
  v_next_hours      NUMERIC;
  v_next_date       DATE;
  v_schedule_id     UUID;
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

    EXIT WHEN v_next_hours IS NOT NULL OR v_next_date IS NOT NULL;
  END LOOP;

  -- Only UPDATE when values actually change; otherwise the UPDATE would
  -- re-fire this trigger, causing infinite recursion.
  UPDATE equipment_asset_stats
  SET next_maintenance_due_hours   = v_next_hours,
      next_maintenance_due_date    = v_next_date,
      next_maintenance_schedule_id = v_schedule_id,
      updated_at                   = NOW()
  WHERE asset_id = NEW.asset_id
    AND (
      next_maintenance_due_hours   IS DISTINCT FROM v_next_hours
      OR next_maintenance_due_date IS DISTINCT FROM v_next_date
      OR next_maintenance_schedule_id IS DISTINCT FROM v_schedule_id
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
