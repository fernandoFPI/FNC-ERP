-- Migration 150: Contractor Deviation Requests (PRODOM Phase 3)
-- Formal requests to deviate from a specification, standard, or approved document.
-- Auto-numbered CDR-YYYY-NNN per project.

CREATE TABLE project_cdrs (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cdr_number           VARCHAR(30)  NOT NULL,
  discipline           VARCHAR(50),
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  -- What is being deviated from
  document_ref         VARCHAR(100),
  clause_ref           VARCHAR(100),
  -- Impact assessment
  technical_impact     TEXT,
  commercial_impact    TEXT,
  proposed_alternative TEXT,
  -- Workflow
  status               VARCHAR(20)  NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','under_review','approved','rejected','withdrawn')),
  submitted_at         TIMESTAMPTZ,
  decided_at           TIMESTAMPTZ,
  decision_by          VARCHAR(255),
  decision_notes       TEXT,
  created_by_id        UUID         REFERENCES users(id),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, cdr_number)
);

CREATE INDEX idx_cdrs_project ON project_cdrs(project_id);
CREATE INDEX idx_cdrs_status  ON project_cdrs(status);

COMMENT ON TABLE project_cdrs IS
  'Contractor Deviation Request register. Each CDR references the spec/clause being deviated from, '
  'captures technical and commercial impact, and tracks a multi-step approval chain.';
