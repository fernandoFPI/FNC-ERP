-- Read-only general health check: PO pipeline state and current inventory
-- levels. Written to give a baseline picture of production before the G9
-- stock-locking PR merges — nothing here is specific to that change except
-- section C, which is worth re-running after merge to see reservations
-- start appearing.
--
-- Usage: psql "$DATABASE_URL" -f packages/db/scripts/po_inventory_overview.sql

-- ── A. PO counts by status, per company ─────────────────────────────────
SELECT c.name AS company, po.status, COUNT(*) AS count
FROM purchase_orders po
JOIN companies c ON c.id = po.company_id
GROUP BY c.name, po.status
ORDER BY c.name, count DESC;

-- ── B. Stale in-flight POs — non-terminal status, untouched 21+ days ────
-- Not necessarily a problem, but worth a glance: anything stuck here
-- predates (and is unaffected by) the G9 change itself.
SELECT c.name AS company, po.po_number, po.status, po.updated_at,
       NOW() - po.updated_at AS age
FROM purchase_orders po
JOIN companies c ON c.id = po.company_id
WHERE po.status NOT IN ('completed', 'cancelled', 'rejected', 'deleted')
  AND po.updated_at < NOW() - INTERVAL '21 days'
ORDER BY po.updated_at ASC
LIMIT 50;

-- ── C. Current qty_reserved outstanding ─────────────────────────────────
-- Baseline before merge: should be exactly 0 everywhere today (nothing has
-- ever written qty_reserved in production). Compare against the sum of
-- qty_from_stock on in-flight po_lines below — after migration 253's
-- backfill runs, C1 should roughly equal C2 (some gap is expected: lines
-- with no source_location_id, per the earlier dev finding, can't be
-- reserved and are excluded).
SELECT COALESCE(SUM(qty_reserved), 0) AS total_qty_reserved_c1
FROM stock_balances;

SELECT COALESCE(SUM(pl.qty_from_stock), 0) AS total_qty_from_stock_in_flight_c2
FROM po_lines pl
JOIN purchase_orders po ON po.id = pl.po_id
WHERE po.status NOT IN ('cancelled', 'rejected', 'deleted', 'completed');

-- ── D. Inventory summary ────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM products) AS total_products,
  (SELECT COUNT(*) FROM stock_balances) AS total_balance_rows,
  (SELECT COUNT(*) FROM stock_balances WHERE qty_on_hand < 0) AS negative_balance_rows,
  (SELECT COUNT(*) FROM stock_balances WHERE qty_on_hand = 0) AS zero_balance_rows,
  (SELECT COUNT(*) FROM stock_balances WHERE qty_on_hand > 0) AS positive_balance_rows;

-- Total on-hand value at real (non-virtual, non-transit) locations only —
-- virtual_in/virtual_out balances are counter-entries, not real stock, and
-- would distort a value total if included.
SELECT c.name AS company, SUM(sb.qty_on_hand * sb.average_cost) AS total_inventory_value
FROM stock_balances sb
JOIN stock_locations sl ON sl.id = sb.location_id
JOIN companies c ON c.id = sl.company_id
WHERE sl.type NOT IN ('virtual_in', 'virtual_out', 'transit')
  AND sb.qty_on_hand > 0
GROUP BY c.name
ORDER BY total_inventory_value DESC;
