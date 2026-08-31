-- issueStockForPOLines (services/gateway/src/graphql/resolvers.ts) silently
-- dropped any po_line marked covered from stock during inventory check if it
-- had no catalog product_id (a free-text item never matched) -- the auto-
-- created Store Out header still appeared, just with zero lines, and the
-- physical stock was never actually deducted or recorded anywhere despite
-- the PO showing Completed. Fixed in code to queue these on the same
-- pending_product_catalog_items worklist store_in/direct_delivery already
-- use for exactly this situation, instead of dropping them.

ALTER TABLE pending_product_catalog_items
  DROP CONSTRAINT IF EXISTS pending_product_catalog_items_source_check;
ALTER TABLE pending_product_catalog_items
  ADD CONSTRAINT pending_product_catalog_items_source_check
  CHECK (source IN ('store_in', 'direct_delivery', 'stock_issuance'));

-- Retroactively queue every historical line this already happened to:
-- po_lines marked covered from stock with no product_id, scoped to POs that
-- already have an auto-created Store Out (i.e. issueStockForPOLines already
-- ran and silently dropped them) -- not lines still awaiting that step,
-- which the fixed code will now queue correctly on its own.
INSERT INTO pending_product_catalog_items
  (company_id, po_id, po_line_id, description, qty, uom, unit_price, currency_code, source)
SELECT DISTINCT ON (pl.id)
  po.company_id, po.id, pl.id, pl.description, pl.qty_from_stock, pl.uom, pl.unit_price, pl.currency_code,
  'stock_issuance'
FROM po_lines pl
JOIN purchase_orders po ON po.id = pl.po_id
JOIN project_material_issues pmi ON pmi.po_id = po.id
WHERE pl.product_id IS NULL
  AND pl.qty_from_stock > 0
ON CONFLICT (po_line_id) DO NOTHING;
