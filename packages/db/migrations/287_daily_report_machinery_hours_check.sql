BEGIN;

-- Defense in depth alongside the resolver-side 0-24 validation added to
-- addDailyReportMachinery — the columns had no bound at all before this,
-- so a direct GraphQL call (bypassing the resolver check) or a future
-- caller could still write negative or nonsensical hour values.
ALTER TABLE project_daily_report_machinery
  ADD CONSTRAINT project_daily_report_machinery_working_hours_check CHECK (working_hours IS NULL OR (working_hours >= 0 AND working_hours <= 24)),
  ADD CONSTRAINT project_daily_report_machinery_idle_hours_check CHECK (idle_hours IS NULL OR (idle_hours >= 0 AND idle_hours <= 24)),
  ADD CONSTRAINT project_daily_report_machinery_breakdown_hours_check CHECK (breakdown_hours IS NULL OR (breakdown_hours >= 0 AND breakdown_hours <= 24));

COMMIT;
