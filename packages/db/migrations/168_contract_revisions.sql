-- Migration 168: Contract revisioning (fills a gap — contracts had none)
-- Uses a revisions-log pattern (not new-row-per-revision) because a contract has
-- dependent milestones/invoices; the contract row stays current, each amendment is
-- logged as a snapshot. This is the canonical pattern for entities with dependents.

CREATE TABLE project_contract_revisions (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id    UUID          NOT NULL REFERENCES project_contracts(id) ON DELETE CASCADE,
  revision       INT           NOT NULL,          -- 1 = original, 2+ = amendments
  contract_value NUMERIC(20,4) NOT NULL,
  currency_code  CHAR(3)       NOT NULL,
  retention_pct  NUMERIC(5,4)  NOT NULL DEFAULT 0,
  end_date       DATE,
  change_summary TEXT          NOT NULL,
  effective_date DATE,
  created_by_id  UUID          REFERENCES users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, revision)
);

CREATE INDEX idx_pcr_contract ON project_contract_revisions(contract_id, revision);

-- Current revision number on the contract itself.
ALTER TABLE project_contracts ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;

-- Seed revision 1 (the original) for every existing contract, so history is complete.
INSERT INTO project_contract_revisions
  (contract_id, revision, contract_value, currency_code, retention_pct, end_date, change_summary, effective_date, created_by_id, created_at)
SELECT c.id, 1, c.contract_value, c.currency_code, c.retention_pct, c.end_date,
       'Original contract', c.contract_date, c.created_by, c.created_at
FROM project_contracts c
ON CONFLICT (contract_id, revision) DO NOTHING;

COMMENT ON TABLE project_contract_revisions IS 'Amendment/revision log for project contracts; contract row holds the current terms';
