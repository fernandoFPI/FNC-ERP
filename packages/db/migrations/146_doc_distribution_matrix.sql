-- Migration 146: Document Distribution Matrix (DDM)
-- Defines which external companies receive which document types at which status trigger.
-- Used to auto-generate transmittals (Phase 2) when a document reaches a target status.

CREATE TABLE project_doc_distribution_matrix (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_name    VARCHAR(255) NOT NULL,
  contact_name    VARCHAR(255),
  contact_email   VARCHAR(255),
  -- NULL means "applies to all disciplines / all doc types"
  discipline      VARCHAR(50),
  doc_type        VARCHAR(50),
  -- Status at which this distribution is triggered (IFA, IFR, IFC, AFC, etc.)
  status_trigger  VARCHAR(20)  NOT NULL,
  copies          INTEGER      NOT NULL DEFAULT 1,
  -- PDF = soft copy PDF; DWG = AutoCAD native; Native = original format; Hard Copy = physical
  format          VARCHAR(20)  NOT NULL DEFAULT 'PDF'
    CHECK (format IN ('PDF', 'DWG', 'Native', 'Hard Copy')),
  -- If true, transmittal is auto-created when a matching document reaches status_trigger
  auto_transmit   BOOLEAN      NOT NULL DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ddm_project   ON project_doc_distribution_matrix(project_id);
CREATE INDEX idx_ddm_trigger    ON project_doc_distribution_matrix(project_id, status_trigger);

COMMENT ON TABLE project_doc_distribution_matrix IS
  'Document Distribution Matrix: maps which companies receive which document types at which status. Foundation for automatic transmittal generation (Phase 2).';
