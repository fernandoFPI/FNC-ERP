BEGIN;

-- A cost change big enough to trip company_price_tolerance (the same
-- tolerance already used for over_tolerance purchases, see
-- 258_g1_requisition_split_phase1/259_seed_price_tolerance) no longer
-- writes straight to products.standard_cost. recordProductCostChange
-- (resolvers.ts) parks it here instead, and the real update + its
-- product_cost_history row only happen once a reviewer approves it — see
-- approveProductCostChange/rejectProductCostChange. A change within
-- tolerance is unaffected and still applies immediately, same as today.
CREATE TABLE product_cost_change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  old_cost NUMERIC(20,4),
  new_cost NUMERIC(20,4) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  -- Same vocabulary as product_cost_history.source_type: 'po_receipt' |
  -- 'po_market_pricing' | 'requisition_market_pricing' | 'catalog_link' |
  -- 'stock_adjustment' | 'cost_correction' | 'manual_edit'.
  source_type VARCHAR(30) NOT NULL,
  source_id UUID,
  source_label TEXT,
  requested_by UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_cost_change_requests_product
  ON product_cost_change_requests(product_id, created_at DESC);

-- The approval queue's own worklist — company scope comes from a join
-- through products, so this only needs to be fast for "pending" rows.
CREATE INDEX idx_product_cost_change_requests_pending
  ON product_cost_change_requests(status) WHERE status = 'pending';

COMMIT;
