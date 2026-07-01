-- Fix overtime_threshold_hours column type: INTEGER → NUMERIC(4,2) to support fractional hours (e.g. 1.5)
ALTER TABLE shift_configs
  ALTER COLUMN overtime_threshold_hours TYPE NUMERIC(4,2) USING overtime_threshold_hours::NUMERIC(4,2);
