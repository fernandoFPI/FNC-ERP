BEGIN;

-- Audits every change to products.standard_cost (the single, per-product
-- "Cost" figure — see recordProductCostChange in resolvers.ts for every
-- place this gets written) so a product's page can show what changed it
-- and when, instead of the value just silently drifting. old_cost is
-- nullable only for the very first row a product could theoretically get
-- (recordProductCostChange never actually logs product creation itself,
-- since standard_cost is already right from the INSERT — this stays
-- nullable defensively, not because it's expected to be used).
CREATE TABLE product_cost_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  old_cost NUMERIC(20,4),
  new_cost NUMERIC(20,4) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  -- 'po_receipt' | 'po_market_pricing' | 'requisition_market_pricing' |
  -- 'catalog_link' | 'stock_adjustment' | 'cost_correction' | 'manual_edit'
  source_type VARCHAR(30) NOT NULL,
  source_id UUID,
  -- Human-readable reference resolved at write time (e.g. a PO/requisition
  -- number) — stored directly rather than joined later, since source_id's
  -- target table depends on source_type and some sources (a manual edit)
  -- have no real record to join to at all.
  source_label TEXT,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_cost_history_product
  ON product_cost_history(product_id, changed_at DESC);

COMMIT;
