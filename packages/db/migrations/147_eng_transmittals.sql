-- Migration 147: Engineering Document Transmittals — Header (PRODOM Phase 2)
-- Formal numbered packages for outgoing and incoming document distribution.
-- Outgoing: user selects docs from register → numbered cover sheet → issued to recipient → acknowledged.
-- Incoming: log documents received from client/subcontractor → link to engineering register.

CREATE TABLE project_eng_transmittals (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Auto-generated: TRS-OUT-YYYYMM-NNN or TRS-IN-YYYYMM-NNN
  transmittal_no   VARCHAR(60)  NOT NULL,
  direction        VARCHAR(10)  NOT NULL DEFAULT 'outgoing'
    CHECK (direction IN ('outgoing','incoming')),
  title            VARCHAR(255) NOT NULL,
  subject          TEXT,
  -- Outgoing: to_company = recipient; Incoming: to_company = "us" (our org), from_company = sender
  to_company       VARCHAR(255) NOT NULL,
  to_contact       VARCHAR(255),
  to_email         VARCHAR(255),
  from_company     VARCHAR(255),
  from_contact     VARCHAR(255),
  -- Status: draft → sent → received → acknowledged (for outgoing)
  --         or:  draft → received → acknowledged (for incoming: log and acknowledge)
  status           VARCHAR(20)  NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','received','acknowledged')),
  -- Timestamps per status transition
  sent_date        TIMESTAMPTZ,
  received_date    TIMESTAMPTZ,
  acknowledged_at  TIMESTAMPTZ,
  acknowledged_by  VARCHAR(255),
  due_date         DATE,
  -- Metadata
  notes            TEXT,
  created_by_id    UUID         REFERENCES users(id),
  created_by_name  VARCHAR(255),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, transmittal_no)
);

CREATE INDEX idx_eng_tr_project   ON project_eng_transmittals(project_id);
CREATE INDEX idx_eng_tr_direction ON project_eng_transmittals(project_id, direction);
CREATE INDEX idx_eng_tr_status    ON project_eng_transmittals(project_id, status);

COMMENT ON TABLE project_eng_transmittals IS
  'Engineering transmittal headers. Outgoing: issued to recipients from doc register. '
  'Incoming: received from client/subcontractors, linked to the register (Phase 2).';
