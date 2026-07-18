-- Migration 154: Punch List Items (PRODOM Phase 5)
-- Pre-handover snagging register with two-step sign-off workflow.
-- Category A = Safety/operability critical (must clear before commissioning)
-- Category B = Non-critical defects (must clear before handover)
-- Category C = Commissioning items (tracked post-handover)
-- Status: open → in_progress → supervisor_signed → closed (PM counter-sign)

CREATE TABLE project_punch_items (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  punch_no              VARCHAR(30)  NOT NULL,
  category              VARCHAR(5)   NOT NULL CHECK (category IN ('A','B','C')),
  discipline            VARCHAR(50),
  area                  VARCHAR(100),
  title                 VARCHAR(255) NOT NULL,
  description           TEXT,
  subcontractor         VARCHAR(255),
  responsible           VARCHAR(255),
  raised_by             VARCHAR(255),
  raised_date           DATE,
  target_date           DATE,
  status                VARCHAR(30)  NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','supervisor_signed','closed')),
  supervisor_signed_by  VARCHAR(255),
  supervisor_signed_at  TIMESTAMPTZ,
  pm_signed_by          VARCHAR(255),
  pm_signed_at          TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_by_id         UUID         REFERENCES users(id),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, punch_no)
);

CREATE INDEX idx_punch_items_project  ON project_punch_items(project_id);
CREATE INDEX idx_punch_items_category ON project_punch_items(category);
CREATE INDEX idx_punch_items_status   ON project_punch_items(status);

COMMENT ON TABLE project_punch_items IS
  'Punch list register per project. Items cleared through a two-step sign-off: '
  'Supervisor signs first, then PM counter-signs to close. '
  'A-items must be cleared before commissioning; B before handover; C post-handover.';
