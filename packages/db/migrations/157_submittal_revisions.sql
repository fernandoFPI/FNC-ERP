-- Migration 157: Submittal Revision History (PRODOM Phase 6)
-- Each row is one revision submission (R0, R1, R2, ...) with its review outcome.

CREATE TABLE project_submittal_revisions (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  submittal_id    UUID         NOT NULL REFERENCES project_submittals(id) ON DELETE CASCADE,
  revision        VARCHAR(10)  NOT NULL DEFAULT 'R0',
  submitted_date  DATE,
  reviewer        VARCHAR(255),
  reviewed_date   DATE,
  review_status   VARCHAR(30)  NOT NULL DEFAULT 'pending'
    CHECK (review_status IN (
      'pending','approved','approved_with_comments','rejected','resubmit'
    )),
  review_comments TEXT,
  file_id         UUID         REFERENCES files(id),
  file_url        VARCHAR(500),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (submittal_id, revision)
);

CREATE INDEX idx_submittal_revisions_submittal ON project_submittal_revisions(submittal_id);

COMMENT ON TABLE project_submittal_revisions IS
  'Individual revision cycles for a submittal. Tracks who submitted, who reviewed, '
  'and the review outcome (approved / rejected / resubmit).';
