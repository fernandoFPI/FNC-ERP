-- Migration 156: Subcontractor Submittal Register (PRODOM Phase 6)
-- Tracks contractor/subcontractor document submissions for Engineer review.
-- Common types: shop drawings, material submittals, method statements, ITPs.
-- Supersedes the stub project_submittals table from migration 122 (a
-- different, unused schema — no application code ever referenced it).

DROP TABLE IF EXISTS project_submittals;

CREATE TABLE project_submittals (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submittal_no   VARCHAR(30)  NOT NULL,
  type           VARCHAR(50)  NOT NULL DEFAULT 'other'
    CHECK (type IN (
      'shop_drawing','material_submittal','method_statement',
      'inspection_test_plan','quality_plan','other'
    )),
  discipline     VARCHAR(50),
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  subcontractor  VARCHAR(255),
  specified_by   VARCHAR(255),
  spec_section   VARCHAR(100),
  status         VARCHAR(30)  NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending','submitted','under_review','approved',
      'approved_with_comments','rejected','resubmit','closed'
    )),
  required_date  DATE,
  created_by_id  UUID         REFERENCES users(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, submittal_no)
);

CREATE INDEX idx_submittals_project ON project_submittals(project_id);
CREATE INDEX idx_submittals_status  ON project_submittals(project_id, status);
CREATE INDEX idx_submittals_type    ON project_submittals(project_id, type);

COMMENT ON TABLE project_submittals IS
  'Subcontractor submittal register: shop drawings, material submittals, method '
  'statements, ITPs, etc. Each submittal tracks multiple revision cycles.';
