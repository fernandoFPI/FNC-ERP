-- Migration 121: Bidding module — Technical deliverables + Commercial cost model

-- Technical bid deliverables (user-defined per project, seeded with defaults)
CREATE TABLE IF NOT EXISTS bid_deliverables (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  deliverable_type  VARCHAR(50)  NOT NULL DEFAULT 'custom'
                                CHECK (deliverable_type IN ('mto','calculations','datasheets','compliance_matrix','technical_proposal','design_docs','custom')),
  discipline        VARCHAR(50),
  status            VARCHAR(20)  NOT NULL DEFAULT 'not_started'
                                CHECK (status IN ('not_started','in_progress','in_review','approved','na')),
  assigned_to       VARCHAR(255),
  due_date          DATE,
  notes             TEXT,
  sequence          INTEGER      NOT NULL DEFAULT 0,
  created_by_id     UUID         REFERENCES users(id),
  created_by_name   VARCHAR(255),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_deliverables_project ON bid_deliverables(project_id);

-- Commercial cost line items (Material / Labour / Subcontract / Equipment)
CREATE TABLE IF NOT EXISTS bid_cost_items (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_type     VARCHAR(20)   NOT NULL DEFAULT 'material'
                              CHECK (cost_type IN ('material','labour','subcontract','equipment')),
  description   VARCHAR(255)  NOT NULL,
  quantity      NUMERIC(15,4),
  unit          VARCHAR(50),
  unit_cost     NUMERIC(15,2),
  total_cost    NUMERIC(15,2),
  currency_code VARCHAR(3)    NOT NULL DEFAULT 'USD',
  supplier_ref  VARCHAR(255),
  notes         TEXT,
  sequence      INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_cost_items_project ON bid_cost_items(project_id);

-- Supplier quotation register
CREATE TABLE IF NOT EXISTS bid_supplier_quotations (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_name    VARCHAR(255)  NOT NULL,
  item_description VARCHAR(255)  NOT NULL,
  amount           NUMERIC(15,2),
  currency_code    VARCHAR(3)    NOT NULL DEFAULT 'USD',
  validity_date    DATE,
  file_id          UUID          REFERENCES files(id),
  notes            TEXT,
  status           VARCHAR(20)   NOT NULL DEFAULT 'received'
                                 CHECK (status IN ('pending','received','selected','rejected')),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bid_quotations_project ON bid_supplier_quotations(project_id);

-- Commercial bid summary / approval (one row per project)
CREATE TABLE IF NOT EXISTS bid_commercial_summary (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID          NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  overhead_pct       NUMERIC(6,2)  NOT NULL DEFAULT 0,
  margin_pct         NUMERIC(6,2)  NOT NULL DEFAULT 0,
  discount_pct       NUMERIC(6,2)  NOT NULL DEFAULT 0,
  contingency_pct    NUMERIC(6,2)  NOT NULL DEFAULT 0,
  currency_code      VARCHAR(3)    NOT NULL DEFAULT 'USD',
  approval_status    VARCHAR(20)   NOT NULL DEFAULT 'draft'
                                   CHECK (approval_status IN ('draft','submitted','approved','rejected')),
  submitted_by_id    UUID          REFERENCES users(id),
  submitted_by_name  VARCHAR(255),
  submitted_at       TIMESTAMPTZ,
  approved_by_id     UUID          REFERENCES users(id),
  approved_by_name   VARCHAR(255),
  approved_at        TIMESTAMPTZ,
  rejection_reason   TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
