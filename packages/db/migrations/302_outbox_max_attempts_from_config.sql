-- Migration 302 (G5): service_outbox.max_attempts always defaulted to 5
-- (nothing at any of the ~50 INSERT sites across the codebase ever set it),
-- while outbox_event_configs says 7 for the critical financial events
-- (PROJECT_INVOICE_JOURNAL_REQUESTED, INVOICE_PAYMENT_JOURNAL_REQUESTED,
-- PAYROLL_JOURNAL_REQUESTED, MO_JOURNAL_REQUESTED,
-- RENTAL_INVOICE_JOURNAL_REQUESTED, INTERCO_STOCK_MOVE_DETECTED). The
-- processor's poll query filters on the ROW's own max_attempts
-- (`attempts < max_attempts`), so once a critical event hit 5 failed
-- attempts it silently fell out of that WHERE clause forever — never
-- retried again, and never routed to outbox_dead_letters either, because
-- that only happens from inside the same per-event loop the poll query
-- already excluded it from. No error, no DLQ row, no alert: just a
-- "failed 5/5" row sitting there permanently, 2 attempts short of what
-- its own config promised.
--
-- Fix at the single point every INSERT already goes through — a BEFORE
-- INSERT trigger — rather than editing every call site: copy the matching
-- outbox_event_configs.max_attempts onto the new row when one exists.

CREATE OR REPLACE FUNCTION sync_outbox_max_attempts()
RETURNS TRIGGER AS $$
DECLARE
  v_configured_max INTEGER;
BEGIN
  SELECT max_attempts INTO v_configured_max
  FROM outbox_event_configs
  WHERE event_type = NEW.event_type;

  IF v_configured_max IS NOT NULL THEN
    NEW.max_attempts := v_configured_max;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_outbox_max_attempts
  BEFORE INSERT ON service_outbox
  FOR EACH ROW EXECUTE FUNCTION sync_outbox_max_attempts();

-- Backfill: any existing row (delivered or not) whose max_attempts sits
-- below its event's current configured value gets raised to match. For a
-- row already stuck at attempts=max_attempts with status='failed', this
-- also makes it attempts < max_attempts again, so the processor's next
-- poll picks it up and either delivers it or correctly exhausts it into
-- the DLQ this time — it does not touch `attempts`, `status` or
-- `next_retry_at`, so a row whose next_retry_at is in the past is simply
-- eligible again on the next tick, same as any other 'failed' row.
UPDATE service_outbox so
SET max_attempts = oec.max_attempts
FROM outbox_event_configs oec
WHERE oec.event_type = so.event_type
  AND so.max_attempts < oec.max_attempts;
