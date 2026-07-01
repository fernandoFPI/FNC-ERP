-- ── SERVICE OUTBOX ────────────────────────────────────────────────────────────
-- Transactional outbox for reliable cross-service event delivery.
-- Events are written inside the originating service's transaction so they are
-- either committed with the main payload or rolled back together — no ghost rows.
-- A background worker reads this table and delivers events to target services.
CREATE TABLE service_outbox (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  service       VARCHAR(50)  NOT NULL,
  event_type    VARCHAR(100) NOT NULL,
  payload       JSONB        NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','delivered','failed')),
  attempts      INTEGER      NOT NULL DEFAULT 0,
  max_attempts  INTEGER      NOT NULL DEFAULT 5,
  last_error    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Partial index used by the worker: only rows that still need processing
CREATE INDEX idx_outbox_pending
  ON service_outbox(status, next_retry_at)
  WHERE status IN ('pending','failed') AND attempts < max_attempts;
