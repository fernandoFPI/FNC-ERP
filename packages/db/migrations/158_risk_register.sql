-- Migration 158: Risk Register (PRODOM Phase 7)
-- ISO 31000-aligned risk register with 5×5 probability/impact matrix,
-- full lifecycle (open → mitigating → closed), and periodic review history.

CREATE TABLE project_risks (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  risk_no              VARCHAR(20)  NOT NULL,
  category             VARCHAR(50)  NOT NULL DEFAULT 'technical'
    CHECK (category IN (
      'technical','commercial','schedule','hse',
      'contractual','environmental','force_majeure'
    )),
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  cause                TEXT,
  consequence          TEXT,
  owner                VARCHAR(255),
  probability          SMALLINT     NOT NULL DEFAULT 3 CHECK (probability  BETWEEN 1 AND 5),
  impact               SMALLINT     NOT NULL DEFAULT 3 CHECK (impact       BETWEEN 1 AND 5),
  mitigation_plan      TEXT,
  contingency_plan     TEXT,
  residual_probability SMALLINT     CHECK (residual_probability BETWEEN 1 AND 5),
  residual_impact      SMALLINT     CHECK (residual_impact      BETWEEN 1 AND 5),
  status               VARCHAR(20)  NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','mitigating','accepted','closed','transferred')),
  raised_by            VARCHAR(255),
  raised_date          DATE,
  review_date          DATE,
  created_by_id        UUID         REFERENCES users(id),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, risk_no)
);

CREATE TABLE project_risk_reviews (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  risk_id     UUID         NOT NULL REFERENCES project_risks(id) ON DELETE CASCADE,
  probability SMALLINT     NOT NULL CHECK (probability BETWEEN 1 AND 5),
  impact      SMALLINT     NOT NULL CHECK (impact      BETWEEN 1 AND 5),
  notes       TEXT,
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risks_project      ON project_risks(project_id);
CREATE INDEX idx_risks_status       ON project_risks(project_id, status);
CREATE INDEX idx_risks_category     ON project_risks(project_id, category);
CREATE INDEX idx_risk_reviews_risk  ON project_risk_reviews(risk_id);

COMMENT ON TABLE project_risks IS
  'ISO 31000 risk register per project. Probability × Impact (1–5 each) '
  'yields a score of 1–25 mapped to LOW / MEDIUM / HIGH / CRITICAL.';

COMMENT ON TABLE project_risk_reviews IS
  'Periodic risk review snapshots — each row records probability/impact '
  'at the time of review so trend analysis is possible over time.';
