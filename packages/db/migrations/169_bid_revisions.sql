-- Migration 169: Bid revisioning (fills a gap — bids had none, like contracts before 168)
-- Aggregate snapshot pattern (matches project_contract_revisions): the commercial
-- summary row stays current, each revision logs the computed price breakdown + the
-- percentages that produced it. Line items are NOT copied per revision — this
-- captures "what did we quote and why did it move," not a line-by-line diff.

CREATE TABLE project_bid_revisions (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision           INT           NOT NULL,          -- 1 = original, 2+ = re-bids
  direct_cost_total  NUMERIC(15,2) NOT NULL,
  overhead_pct       NUMERIC(6,2)  NOT NULL,
  overhead_amount    NUMERIC(15,2) NOT NULL,
  contingency_pct    NUMERIC(6,2)  NOT NULL,
  contingency_amount NUMERIC(15,2) NOT NULL,
  margin_pct         NUMERIC(6,2)  NOT NULL,
  margin_amount      NUMERIC(15,2) NOT NULL,
  discount_pct       NUMERIC(6,2)  NOT NULL,
  discount_amount    NUMERIC(15,2) NOT NULL,
  bid_price          NUMERIC(15,2) NOT NULL,
  currency_code      VARCHAR(3)    NOT NULL DEFAULT 'USD',
  change_summary     TEXT          NOT NULL,
  created_by_id      UUID          REFERENCES users(id),
  created_by_name    VARCHAR(255),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, revision)
);

CREATE INDEX idx_pbr_project ON project_bid_revisions(project_id, revision);

-- Current revision number on the commercial summary itself.
ALTER TABLE bid_commercial_summary ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;

-- Seed revision 1 (the original) for every project that already has a commercial
-- summary, computing the same price breakdown the bidCommercialSummary resolver uses.
INSERT INTO project_bid_revisions
  (project_id, revision, direct_cost_total, overhead_pct, overhead_amount,
   contingency_pct, contingency_amount, margin_pct, margin_amount,
   discount_pct, discount_amount, bid_price, currency_code, change_summary, created_at)
SELECT
  s.project_id, 1,
  direct.total,
  s.overhead_pct, direct.total * s.overhead_pct / 100,
  s.contingency_pct, direct.total * s.contingency_pct / 100,
  s.margin_pct,
  (direct.total + direct.total * s.overhead_pct / 100 + direct.total * s.contingency_pct / 100) * s.margin_pct / 100,
  s.discount_pct,
  ((direct.total + direct.total * s.overhead_pct / 100 + direct.total * s.contingency_pct / 100)
    + (direct.total + direct.total * s.overhead_pct / 100 + direct.total * s.contingency_pct / 100) * s.margin_pct / 100)
    * s.discount_pct / 100,
  (direct.total + direct.total * s.overhead_pct / 100 + direct.total * s.contingency_pct / 100)
    + (direct.total + direct.total * s.overhead_pct / 100 + direct.total * s.contingency_pct / 100) * s.margin_pct / 100
    - ((direct.total + direct.total * s.overhead_pct / 100 + direct.total * s.contingency_pct / 100)
        + (direct.total + direct.total * s.overhead_pct / 100 + direct.total * s.contingency_pct / 100) * s.margin_pct / 100)
        * s.discount_pct / 100,
  s.currency_code, 'Original bid', s.created_at
FROM bid_commercial_summary s
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(COALESCE(total_cost, quantity * unit_cost, 0)), 0) AS total
  FROM bid_cost_items WHERE project_id = s.project_id
) direct
ON CONFLICT (project_id, revision) DO NOTHING;

COMMENT ON TABLE project_bid_revisions IS 'Aggregate price-snapshot log for bid re-submissions; bid_commercial_summary holds the current commercial position';
