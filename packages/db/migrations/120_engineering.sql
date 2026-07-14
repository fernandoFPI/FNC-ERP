-- Migration 120: Engineering module enhancements
-- Adds engineering fields to rfq_lines, revision snapshots, and drawing register

-- Extend scope line items with engineering reference fields
ALTER TABLE rfq_lines ADD COLUMN IF NOT EXISTS discipline      VARCHAR(50);
ALTER TABLE rfq_lines ADD COLUMN IF NOT EXISTS drawing_ref     VARCHAR(255);
ALTER TABLE rfq_lines ADD COLUMN IF NOT EXISTS engineering_ref VARCHAR(255);
ALTER TABLE rfq_lines ADD COLUMN IF NOT EXISTS spec_section    VARCHAR(255);

-- Engineering scope revision records (formal Rev A → Rev B cycle)
CREATE TABLE IF NOT EXISTS engineering_revisions (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_code   VARCHAR(20) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'issued'
                              CHECK (status IN ('issued','archived')),
  notes           TEXT,
  issued_by_id    UUID        REFERENCES users(id),
  issued_by_name  VARCHAR(255),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_data   JSONB       NOT NULL DEFAULT '[]',
  item_count      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_rev_project ON engineering_revisions(project_id);

-- Drawing Register
CREATE TABLE IF NOT EXISTS project_drawings (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_number    VARCHAR(100) NOT NULL,
  title             VARCHAR(255) NOT NULL,
  discipline        VARCHAR(50),
  scale             VARCHAR(50),
  paper_size        VARCHAR(20),
  revision          VARCHAR(20),
  status            VARCHAR(30) NOT NULL DEFAULT 'preliminary'
                                CHECK (status IN ('preliminary','for_review','for_construction','as_built','cancelled','superseded')),
  issue_date        DATE,
  notes             TEXT,
  file_id           UUID        REFERENCES files(id),
  parent_drawing_id UUID        REFERENCES project_drawings(id),
  uploaded_by_id    UUID        REFERENCES users(id),
  uploaded_by_name  VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drawings_project ON project_drawings(project_id);
CREATE INDEX IF NOT EXISTS idx_drawings_parent  ON project_drawings(parent_drawing_id);
