-- Migration 133: Variation Orders module

CREATE TABLE IF NOT EXISTS project_variation_orders (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vo_number            VARCHAR(50)   NOT NULL,
  title                VARCHAR(255)  NOT NULL,
  description          TEXT,
  change_type          VARCHAR(30)   NOT NULL DEFAULT 'additional_work'
                         CHECK (change_type IN ('additional_work','omission','substitution','acceleration','prolongation','other')),
  initiated_by         VARCHAR(30)   NOT NULL DEFAULT 'client'
                         CHECK (initiated_by IN ('client','engineer','contractor','regulatory')),
  instruction_date     DATE,
  received_date        DATE,
  schedule_impact_days INTEGER       NOT NULL DEFAULT 0,
  vo_value             NUMERIC(15,2) NOT NULL DEFAULT 0,
  approved_value       NUMERIC(15,2),
  currency_code        VARCHAR(3)    NOT NULL DEFAULT 'USD',
  client_ref           VARCHAR(255),
  impact_analysis      TEXT,
  technical_notes      TEXT,
  status               VARCHAR(30)   NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','submitted','under_review','approved','rejected','partial','on_hold')),
  submitted_at         TIMESTAMPTZ,
  decided_at           TIMESTAMPTZ,
  rejection_reason     TEXT,
  created_by           UUID          REFERENCES users(id),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, vo_number)
);
CREATE INDEX IF NOT EXISTS idx_vo_project ON project_variation_orders(project_id);

CREATE TABLE IF NOT EXISTS project_vo_cost_items (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  vo_id       UUID          NOT NULL REFERENCES project_variation_orders(id) ON DELETE CASCADE,
  category    VARCHAR(30)   NOT NULL DEFAULT 'other'
                CHECK (category IN ('labor','material','equipment','subcontract','overhead','margin','other')),
  description VARCHAR(255)  NOT NULL,
  quantity    NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit        VARCHAR(20),
  unit_rate   NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vo_cost_items_vo ON project_vo_cost_items(vo_id);

CREATE TABLE IF NOT EXISTS project_vo_correspondence (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  vo_id               UUID         NOT NULL REFERENCES project_variation_orders(id) ON DELETE CASCADE,
  correspondence_date DATE         NOT NULL,
  direction           VARCHAR(10)  NOT NULL CHECK (direction IN ('sent','received')),
  reference_number    VARCHAR(100),
  subject             VARCHAR(255) NOT NULL,
  description         TEXT,
  created_by          UUID         REFERENCES users(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vo_corr_vo ON project_vo_correspondence(vo_id);

CREATE TABLE IF NOT EXISTS project_vo_drawings (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  vo_id          UUID         NOT NULL REFERENCES project_variation_orders(id) ON DELETE CASCADE,
  drawing_number VARCHAR(100) NOT NULL,
  revision       VARCHAR(20),
  title          VARCHAR(255),
  notes          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vo_drawings_vo ON project_vo_drawings(vo_id);
