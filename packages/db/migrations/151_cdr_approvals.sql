-- Migration 151: CDR Approval Chain (PRODOM Phase 3)
-- Multi-step approval log per CDR: Project Engineer → Project Manager → Client Representative.
-- step_order determines the sequence; the chain may be shorter for internal deviations.

CREATE TABLE project_cdr_approvals (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  cdr_id         UUID         NOT NULL REFERENCES project_cdrs(id) ON DELETE CASCADE,
  step_order     INTEGER      NOT NULL DEFAULT 1,
  approver_role  VARCHAR(80)  NOT NULL,
  approver_name  VARCHAR(255),
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','skipped')),
  comments       TEXT,
  actioned_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (cdr_id, step_order)
);

CREATE INDEX idx_cdr_approvals_cdr ON project_cdr_approvals(cdr_id);

COMMENT ON TABLE project_cdr_approvals IS
  'Ordered approval steps for each CDR. Each row is one approver in the chain. '
  'Status pending → approved/rejected as each approver acts. A rejection at any step closes the CDR.';
