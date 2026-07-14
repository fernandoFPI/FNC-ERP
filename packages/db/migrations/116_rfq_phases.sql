-- ── RFQ Phases ────────────────────────────────────────────────────────────
-- Tracks the three bid-preparation phases (Engineering / Pricing / Executing)
-- for RFQ projects. Each phase has a document archive via document_attachments
-- (entity_type = 'rfq_phase'). Rows are seeded lazily on first API access.

CREATE TABLE IF NOT EXISTS rfq_phases (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_type   VARCHAR(20) NOT NULL CHECK (phase_type IN ('engineering','pricing','executing')),
  service_type VARCHAR(20) NOT NULL DEFAULT 'technical'
                           CHECK (service_type IN ('technical','commercial','both')),
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','in_progress','complete')),
  notes        TEXT,
  sequence     INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, phase_type)
);

CREATE INDEX IF NOT EXISTS idx_rfq_phases_project ON rfq_phases(project_id);
