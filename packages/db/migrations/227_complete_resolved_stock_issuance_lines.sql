-- Retroactively completes stock-issuance lines whose pending catalog item
-- was already resolved before completeStockIssuanceLineForResolvedProduct
-- existed (services/gateway/src/graphql/resolvers.ts) -- resolving one
-- previously only fixed the po_line's product_id, never the historical
-- Store Out draft that was left behind with zero lines for it (found via
-- PO-2026-0012: both items were resolved in the catalog, but its Store Out
-- still showed "No items").

-- Ensure every affected company has a 'virtual_out' location to issue into,
-- auto-creating the same "Project Consumption" placeholder the live code
-- creates on demand.
INSERT INTO stock_locations (company_id, name, type, is_active)
SELECT DISTINCT po.company_id, 'Project Consumption', 'virtual_out', true
FROM pending_product_catalog_items ppci
JOIN po_lines pl ON pl.id = ppci.po_line_id
JOIN purchase_orders po ON po.id = ppci.po_id
WHERE ppci.status = 'resolved' AND ppci.source = 'stock_issuance'
  AND pl.product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM project_material_issue_lines WHERE po_line_id = pl.id)
  AND NOT EXISTS (
    SELECT 1 FROM stock_locations sl
    WHERE sl.company_id = po.company_id AND sl.type = 'virtual_out' AND sl.is_active = true
  );

WITH targets AS (
  SELECT
    ppci.po_line_id,
    pl.product_id,
    pl.qty_from_stock,
    pl.store_price,
    pmi.id AS issue_id,
    COALESCE(
      pl.source_location_id,
      (SELECT id FROM stock_locations WHERE company_id = po.company_id AND type = 'warehouse' AND is_active = true LIMIT 1),
      (SELECT id FROM stock_locations WHERE company_id = po.company_id AND is_active = true LIMIT 1)
    ) AS from_location_id,
    (SELECT id FROM stock_locations WHERE company_id = po.company_id AND type = 'virtual_out' AND is_active = true LIMIT 1) AS to_location_id
  FROM pending_product_catalog_items ppci
  JOIN po_lines pl ON pl.id = ppci.po_line_id
  JOIN purchase_orders po ON po.id = ppci.po_id
  JOIN project_material_issues pmi ON pmi.po_id = po.id
  WHERE ppci.status = 'resolved' AND ppci.source = 'stock_issuance'
    AND pl.product_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM project_material_issue_lines WHERE po_line_id = pl.id)
)
INSERT INTO project_material_issue_lines
  (issue_id, product_id, po_line_id, qty_issued, unit_cost, total_cost, from_location_id, to_location_id)
SELECT
  t.issue_id, t.product_id, t.po_line_id, t.qty_from_stock,
  cost.unit_cost, t.qty_from_stock * cost.unit_cost, t.from_location_id, t.to_location_id
FROM targets t
CROSS JOIN LATERAL (
  SELECT COALESCE(
    NULLIF(t.store_price, 0),
    (SELECT sb.average_cost FROM stock_balances sb WHERE sb.product_id = t.product_id AND sb.location_id = t.from_location_id LIMIT 1),
    0
  ) AS unit_cost
) cost;
