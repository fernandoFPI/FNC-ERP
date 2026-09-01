-- applyPOEditChanges (services/gateway/src/graphql/resolvers.ts) updated a
-- po_line's qty_ordered/unit_price when an edit request was approved, but
-- never recalculated that line's total_price -- so the PO's own subtotal/
-- total_amount, and everything reading total_price directly (the printed
-- PO document included), kept showing the pre-edit amount. Found via
-- PO-2026-0011: qty edited 2 -> 1, price unchanged, printed total stayed
-- at the old 2x amount.
--
-- Recomputes total_price for every po_line that was ever the target of an
-- approved edit request's qty_ordered/unit_price change, using the same
-- formula the rest of the codebase uses (a line fully covered from stock
-- still contributes $0 regardless of what its price/qty now say), then
-- re-derives each affected PO's header totals from its now-correct line
-- totals.
WITH affected_lines AS (
  SELECT DISTINCT (elem->>'id')::uuid AS line_id
  FROM po_edit_requests per,
       jsonb_array_elements(COALESCE(per.changes->'lines'->'edited', '[]'::jsonb)) AS elem
  WHERE per.status = 'approved'
    AND elem->>'field' IN ('qty_ordered', 'unit_price')
)
UPDATE po_lines pl
SET total_price = CASE WHEN pl.qty_from_stock >= pl.qty_ordered THEN 0 ELSE pl.qty_ordered * pl.unit_price END
FROM affected_lines al
WHERE pl.id = al.line_id;

WITH affected_pos AS (
  SELECT DISTINCT per.po_id
  FROM po_edit_requests per,
       jsonb_array_elements(COALESCE(per.changes->'lines'->'edited', '[]'::jsonb)) AS elem
  WHERE per.status = 'approved'
    AND elem->>'field' IN ('qty_ordered', 'unit_price')
)
UPDATE purchase_orders po
SET subtotal = (SELECT COALESCE(SUM(total_price * COALESCE(fx_rate_to_base,1)),0) FROM po_lines WHERE po_id = po.id),
    total_amount = (SELECT COALESCE(SUM(total_price * COALESCE(fx_rate_to_base,1)),0) FROM po_lines WHERE po_id = po.id),
    updated_at = NOW()
FROM affected_pos ap
WHERE po.id = ap.po_id;
