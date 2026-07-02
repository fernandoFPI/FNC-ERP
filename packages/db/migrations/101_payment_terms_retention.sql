-- 101: Payment Terms & Retention
-- payment_terms / payment_term_lines: reusable term templates
-- retention_records: per-invoice retention tracking (AR and AP)
-- retention_releases: partial / full release events with journal entries

CREATE TABLE payment_terms (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID          NOT NULL,
  name       VARCHAR(255)  NOT NULL,
  note       TEXT,
  is_active  BOOLEAN       NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE payment_term_lines (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id      UUID          NOT NULL REFERENCES payment_terms(id) ON DELETE CASCADE,
  sequence     INTEGER       NOT NULL DEFAULT 10,
  description  VARCHAR(255),
  value_type   VARCHAR(10)   NOT NULL DEFAULT 'percent'
               CHECK (value_type IN ('percent','fixed')),
  value        NUMERIC(10,4) NOT NULL DEFAULT 0,
  due_type     VARCHAR(30)   NOT NULL DEFAULT 'days'
               CHECK (due_type IN ('immediate','days','end_of_month','end_of_next_month','retention')),
  days         INTEGER       NOT NULL DEFAULT 0,
  is_retention BOOLEAN       NOT NULL DEFAULT false
);

CREATE TABLE retention_records (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID          NOT NULL,
  record_number        VARCHAR(50)   NOT NULL,
  retention_type       VARCHAR(3)    NOT NULL CHECK (retention_type IN ('ar','ap')),
  source_ref           VARCHAR(255),
  project_id           UUID,
  project_name         VARCHAR(255),
  counterparty_name    VARCHAR(255)  NOT NULL,
  invoice_amount       NUMERIC(18,2) NOT NULL,
  retention_rate       NUMERIC(5,2)  NOT NULL,
  retention_amount     NUMERIC(18,2) NOT NULL,
  released_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  status               VARCHAR(20)   NOT NULL DEFAULT 'held'
                       CHECK (status IN ('held','partially_released','released')),
  invoice_date         DATE          NOT NULL,
  expected_release_date DATE,
  released_at          TIMESTAMPTZ,
  retention_account_id UUID,
  offset_account_id    UUID,
  notes                TEXT,
  release_notes        TEXT,
  created_by           UUID,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, record_number)
);

CREATE TABLE retention_releases (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  retention_id     UUID          NOT NULL REFERENCES retention_records(id) ON DELETE RESTRICT,
  company_id       UUID          NOT NULL,
  release_date     DATE          NOT NULL,
  amount           NUMERIC(18,2) NOT NULL,
  journal_entry_id UUID,
  notes            TEXT,
  released_by      UUID,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pt_company        ON payment_terms(company_id);
CREATE INDEX idx_ptl_term          ON payment_term_lines(term_id);
CREATE INDEX idx_ret_company       ON retention_records(company_id);
CREATE INDEX idx_ret_type_status   ON retention_records(company_id, retention_type, status);
CREATE INDEX idx_ret_project       ON retention_records(project_id);
CREATE INDEX idx_ret_release_date  ON retention_records(expected_release_date);
CREATE INDEX idx_retrel_retention  ON retention_releases(retention_id);
