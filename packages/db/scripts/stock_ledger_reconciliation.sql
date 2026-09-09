-- Read-only diagnostic: finds every (product, location, lot) where
-- stock_balances.qty_on_hand does NOT match what replaying stock_moves for
-- that key actually sums to. A non-zero drift means something wrote to
-- stock_balances outside the trigger — a raw UPDATE, a direct SQL fix run
-- by hand, anything that didn't go through an INSERT on stock_moves. The
-- trigger itself can never produce drift (it's the only writer that's
-- supposed to exist), so every row this returns is evidence of an
-- untracked patch.
--
-- Usage: psql "$DATABASE_URL" -f packages/db/scripts/stock_ledger_reconciliation.sql

WITH ledger AS (
  SELECT product_id, to_location_id AS location_id, lot_id, qty AS delta FROM stock_moves
  UNION ALL
  SELECT product_id, from_location_id AS location_id, lot_id, -qty AS delta FROM stock_moves
),
computed AS (
  SELECT product_id, location_id, lot_id, SUM(delta) AS ledger_qty
  FROM ledger
  GROUP BY product_id, location_id, lot_id
)
SELECT
  p.sku,
  p.name AS product_name,
  sl.name AS location_name,
  sl.type AS location_type,
  COALESCE(c.lot_id, sb.lot_id) AS lot_id,
  COALESCE(c.ledger_qty, 0) AS ledger_computed_qty,
  COALESCE(sb.qty_on_hand, 0) AS stock_balances_qty_on_hand,
  COALESCE(sb.qty_on_hand, 0) - COALESCE(c.ledger_qty, 0) AS drift,
  COALESCE(c.product_id, sb.product_id) AS product_id,
  COALESCE(c.location_id, sb.location_id) AS location_id
FROM computed c
FULL OUTER JOIN stock_balances sb
  ON sb.product_id = c.product_id
 AND sb.location_id = c.location_id
 AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
JOIN products p ON p.id = COALESCE(c.product_id, sb.product_id)
JOIN stock_locations sl ON sl.id = COALESCE(c.location_id, sb.location_id)
WHERE ABS(COALESCE(sb.qty_on_hand, 0) - COALESCE(c.ledger_qty, 0)) > 0.0001
ORDER BY ABS(COALESCE(sb.qty_on_hand, 0) - COALESCE(c.ledger_qty, 0)) DESC;
