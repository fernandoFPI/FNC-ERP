-- Migration 145: Document Review Comment Sheets
-- Per-revision comment threads for the engineering document review cycle.
-- Each comment can be responded to and marked as accepted/partial/rejected.

CREATE TABLE project_doc_comments (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID         NOT NULL REFERENCES engineering_documents(id) ON DELETE CASCADE,
  revision        VARCHAR(20)  NOT NULL,
  reviewer_id     UUID         NOT NULL REFERENCES users(id),
  reviewer_name   VARCHAR(255),
  comment_number  INTEGER      NOT NULL,
  -- Location reference: e.g. "Sheet 3, Grid B-2" or "Clause 4.2.1" or "Para 3.5"
  location_ref    VARCHAR(150),
  comment_text    TEXT         NOT NULL,
  -- major = must be resolved before approval; minor = noted; info = FYI only
  category        VARCHAR(10)  NOT NULL DEFAULT 'minor'
    CHECK (category IN ('major', 'minor', 'info')),
  -- Response fields (filled by document originator)
  response_text   TEXT,
  response_by_id  UUID         REFERENCES users(id),
  response_name   VARCHAR(255),
  response_date   TIMESTAMPTZ,
  resolution      VARCHAR(20)
    CHECK (resolution IN ('accepted', 'partial', 'rejected', 'withdrawn')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doc_comments_document ON project_doc_comments(document_id);
CREATE INDEX idx_doc_comments_revision ON project_doc_comments(document_id, revision);
CREATE INDEX idx_doc_comments_reviewer ON project_doc_comments(reviewer_id);

COMMENT ON TABLE project_doc_comments IS
  'Review comment sheets attached to specific document revisions. Each comment tracks category, location, text, and the originator response + resolution.';
