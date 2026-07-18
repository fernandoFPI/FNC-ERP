-- Migration 149: Technical Queries (PRODOM Phase 3)
-- Formal document-linked questions raised by subcontractors or internal team.
-- Auto-numbered TQ-YYYY-NNN per project. Overdue when due_date < NOW() and status != 'closed'.

CREATE TABLE project_tqs (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tq_number         VARCHAR(30)  NOT NULL,
  discipline        VARCHAR(50),
  priority          VARCHAR(10)  NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent','normal','low')),
  subject           VARCHAR(255) NOT NULL,
  description       TEXT,
  raised_by         VARCHAR(255),
  raised_date       DATE,
  -- Optional link to engineering document register
  document_id       UUID         REFERENCES engineering_documents(id),
  document_ref      VARCHAR(100),
  document_revision VARCHAR(20),
  -- Response tracking
  status            VARCHAR(20)  NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','responded','closed')),
  response          TEXT,
  response_by       VARCHAR(255),
  response_date     DATE,
  due_date          DATE,
  closed_at         TIMESTAMPTZ,
  created_by_id     UUID         REFERENCES users(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, tq_number)
);

CREATE INDEX idx_tqs_project  ON project_tqs(project_id);
CREATE INDEX idx_tqs_status   ON project_tqs(status);
CREATE INDEX idx_tqs_due_date ON project_tqs(due_date);

COMMENT ON TABLE project_tqs IS
  'Technical Query register per project. Each TQ is formally numbered, discipline-tagged, '
  'priority-flagged, and tracked through Open → Under Review → Responded → Closed.';
