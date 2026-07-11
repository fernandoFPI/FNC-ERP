-- ── RFQ Module ────────────────────────────────────────────────
-- Adds is_rfq flag + RFQ-specific columns to projects,
-- and a new rfq_lines table for scope of work items.

-- ── STEP 1: New columns on projects ───────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_rfq              BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rfq_estimated_cost  NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS rfq_outcome         VARCHAR(20)
    CHECK (rfq_outcome IN ('won', 'lost', 'withdrawn')),
  ADD COLUMN IF NOT EXISTS rfq_outcome_reason  TEXT;

-- ── STEP 2: RFQ scope-of-work lines ───────────────────────────
CREATE TABLE IF NOT EXISTS rfq_lines (
  id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sequence           INTEGER      NOT NULL DEFAULT 0,
  description        TEXT         NOT NULL,
  quantity           NUMERIC(15,4),
  unit               VARCHAR(50),
  estimated_unit_cost NUMERIC(20,2),
  bid_unit_price     NUMERIC(20,2),
  notes              TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── STEP 3: Indexes ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rfq_lines_project
  ON rfq_lines(project_id);

CREATE INDEX IF NOT EXISTS idx_projects_is_rfq
  ON projects(company_id, is_rfq)
  WHERE is_rfq = true;
