-- Migration 170: VO -> Contract value + Cost budget linking (Phase 5)
-- An approved VO increases the linked contract's value (logged as a contract
-- revision, reusing the 168 revisions log) and gets one dedicated cost-code
-- budget line. applied_value tracks what's currently reflected downstream so
-- setVOStatus reverting a VO out of 'approved' can reverse exactly that amount
-- (see syncVOFinancialLinks in resolvers.ts) instead of drifting.

ALTER TABLE project_variation_orders
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES project_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_value NUMERIC(15,2);

COMMENT ON COLUMN project_variation_orders.applied_value IS
  'Amount currently applied to contract_value + cost-code budget; NULL when the VO is not (or no longer) approved.';

ALTER TABLE project_cost_codes
  ADD COLUMN IF NOT EXISTS source_vo_id UUID REFERENCES project_variation_orders(id) ON DELETE CASCADE;

-- One dedicated cost-code line per VO; lets syncVOFinancialLinks upsert idempotently.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_codes_source_vo
  ON project_cost_codes(source_vo_id) WHERE source_vo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vo_contract ON project_variation_orders(contract_id);
