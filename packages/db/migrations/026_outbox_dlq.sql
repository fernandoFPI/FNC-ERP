-- ── DEAD LETTER QUEUE ──────────────────────────────────────────
-- Events that exhausted all retry attempts land here.
-- Never automatically retried — requires human review.
-- System admins are notified when critical events land here.
CREATE TABLE outbox_dead_letters (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Original outbox event data
  original_outbox_id  UUID        NOT NULL,
  service             VARCHAR(50) NOT NULL,
  event_type          VARCHAR(100) NOT NULL,
  payload             JSONB       NOT NULL,
  -- Failure history
  total_attempts      INTEGER     NOT NULL,
  first_attempted_at  TIMESTAMPTZ NOT NULL,
  last_attempted_at   TIMESTAMPTZ NOT NULL,
  last_error          TEXT        NOT NULL,
  -- { attempt: number, error: string, at: string }[]
  error_history       JSONB       NOT NULL DEFAULT '[]',
  -- Priority determines how urgently this needs human attention
  priority            VARCHAR(10) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical','high','normal','low')),
  -- Review workflow
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','reviewed','retried','dismissed')),
  reviewed_by         UUID REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT,
  -- If retried, points to the new outbox event
  retry_outbox_id     UUID,
  retried_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PER-EVENT-TYPE RETRY CONFIGURATION ────────────────────────
-- Overrides global defaults in the outbox processor.
-- Loaded and cached by the worker on startup, refreshed every 5 minutes.
CREATE TABLE outbox_event_configs (
  id                            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type                    VARCHAR(100) NOT NULL UNIQUE,
  max_attempts                  INTEGER     NOT NULL DEFAULT 5,
  initial_retry_delay_seconds   INTEGER     NOT NULL DEFAULT 5,
  backoff_multiplier            NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  max_retry_delay_seconds       INTEGER     NOT NULL DEFAULT 3600,
  dlq_priority                  VARCHAR(10) NOT NULL DEFAULT 'normal'
    CHECK (dlq_priority IN ('critical','high','normal','low')),
  alert_on_dlq                  BOOLEAN     NOT NULL DEFAULT false,
  description                   TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SEED: EVENT TYPE CONFIGURATIONS ───────────────────────────
INSERT INTO outbox_event_configs
  (event_type, max_attempts, initial_retry_delay_seconds,
   backoff_multiplier, max_retry_delay_seconds,
   dlq_priority, alert_on_dlq, description)
VALUES
  -- Financial integrity — critical, alert immediately
  ('PROJECT_INVOICE_JOURNAL_REQUESTED', 7, 10, 2.0, 3600, 'critical', true,
   'Posts AR/Revenue journal for client invoice'),
  ('INVOICE_PAYMENT_JOURNAL_REQUESTED', 7, 10, 2.0, 3600, 'critical', true,
   'Posts cash/AR journal for client payment'),
  ('PAYROLL_JOURNAL_REQUESTED',         7, 10, 2.0, 3600, 'critical', true,
   'Posts salary journal to GL after payroll run'),
  ('MO_JOURNAL_REQUESTED',              7, 10, 2.0, 3600, 'critical', true,
   'Posts WIP and finished goods journal for MO'),
  ('RENTAL_INVOICE_JOURNAL_REQUESTED',  7, 10, 2.0, 3600, 'critical', true,
   'Posts AR/Revenue journal for rental invoice'),
  ('INTERCO_STOCK_MOVE_DETECTED',       7, 10, 2.0, 3600, 'critical', true,
   'Triggers atomic interco stock transfer and dual journal posting'),

  -- Operational — high priority, alert on failure
  ('STOCK_MOVE_REQUESTED',              5, 5,  2.0, 1800, 'high', true,
   'Creates inventory stock move on PO receipt or project issue'),
  ('INTERCO_STOCK_TRANSFER_EXECUTE',    5, 5,  2.0, 1800, 'high', true,
   'Executes cross-entity stock transfer with dual stock moves'),

  -- Document generation — normal, no alert
  ('PAYSLIP_GENERATION_REQUESTED',      3, 30, 2.0, 900, 'normal', false,
   'Generates PDF payslip and emails to employee'),
  ('PROJECT_INVOICE_PDF_REQUESTED',     3, 30, 2.0, 900, 'normal', false,
   'Generates PDF invoice and emails to client'),
  ('PO_PDF_REQUESTED',                  3, 30, 2.0, 900, 'normal', false,
   'Generates PDF purchase order and emails to vendor'),

  -- Auth notifications — normal/low, no alert
  ('PASSWORD_RESET_EMAIL',              3, 10, 2.0, 300, 'normal', false,
   'Sends password reset email'),
  ('PASSWORD_CHANGED_EMAIL',            3, 10, 2.0, 300, 'normal', false,
   'Sends password changed notification'),
  ('NEW_DEVICE_LOGIN',                  3, 10, 2.0, 300, 'low', false,
   'Sends new device login notification'),
  ('MFA_SETUP_EMAIL',                   3, 10, 2.0, 300, 'low', false,
   'Sends MFA enabled confirmation'),
  ('PUSH_NOTIFICATION',                 3, 5,  2.0, 300, 'low', false,
   'Sends mobile push notification'),
  ('PERIOD_CLOSING_SOON',               2, 60, 2.0, 600, 'low', false,
   'Notifies company admins of upcoming period close');

-- ── EXTEND service_outbox WITH TRACKING COLUMNS ───────────────
ALTER TABLE service_outbox
  ADD COLUMN IF NOT EXISTS error_history        JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS first_attempted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_priority       VARCHAR(10) NOT NULL DEFAULT 'normal';

-- ── INDEXES ────────────────────────────────────────────────────
CREATE INDEX idx_dlq_status
  ON outbox_dead_letters(status)
  WHERE status = 'pending';

CREATE INDEX idx_dlq_priority
  ON outbox_dead_letters(priority, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX idx_dlq_event_type
  ON outbox_dead_letters(event_type, created_at DESC);

CREATE INDEX idx_dlq_original
  ON outbox_dead_letters(original_outbox_id);

CREATE INDEX idx_outbox_config_type
  ON outbox_event_configs(event_type);

-- Priority-aware partial index for the worker processing loop
CREATE INDEX idx_outbox_priority_pending
  ON service_outbox(event_priority, created_at)
  WHERE status IN ('pending','failed') AND attempts < max_attempts;
