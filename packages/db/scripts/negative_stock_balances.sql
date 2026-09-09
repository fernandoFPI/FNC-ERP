-- Read-only diagnostic: every stock_balances row currently sitting below
-- zero, split into two sections. Run before enabling migration
-- 254_stock_balance_transit_exemption.sql (the trigger's negative-balance
-- guard) — it only blocks a move from making a REAL (warehouse/site)
-- location go more negative, so pre-existing negative rows there must be
-- reconciled first (via a Stock Adjustment) or a routine operation on that
-- exact product/location will start failing the moment 254 goes live.
--
-- Usage: psql "$DATABASE_URL" -f packages/db/scripts/negative_stock_balances.sql

-- Section 1: transit/virtual_in/virtual_out locations — expected to run
-- negative by design (they're the counter-entry side of every receipt and
-- cross-company transfer). Informational only, never needs reconciling.
SELECT
  'transit/virtual (expected)' AS category,
  p.sku, p.name AS product_name, sl.name AS location_name, sl.type AS location_type,
  sb.qty_on_hand, sb.qty_reserved, sb.product_id, sb.location_id
FROM stock_balances sb
JOIN products p ON p.id = sb.product_id
JOIN stock_locations sl ON sl.id = sb.location_id
WHERE sb.qty_on_hand < 0
  AND sl.type IN ('transit', 'virtual_in', 'virtual_out')
ORDER BY sb.qty_on_hand ASC;

-- Section 2: real (warehouse/site) locations — NOT expected to be negative.
-- Each of these needs a Stock Adjustment (or, if the negative traces back
-- to an over-consumption/missing receipt worth investigating first, a
-- stock_moves trace like the one used for CABLE-029 — see git history for
-- packages/db/migrations/254_stock_balance_transit_exemption.sql's PR) to
-- bring it to >= 0 before 254 can be applied without risk of unexpectedly
-- blocking a legitimate future operation on that exact product/location.
SELECT
  'real location (needs reconciling)' AS category,
  p.sku, p.name AS product_name, sl.name AS location_name, sl.type AS location_type,
  sb.qty_on_hand, sb.qty_reserved, sb.average_cost, sb.product_id, sb.location_id
FROM stock_balances sb
JOIN products p ON p.id = sb.product_id
JOIN stock_locations sl ON sl.id = sb.location_id
WHERE sb.qty_on_hand < 0
  AND sl.type NOT IN ('transit', 'virtual_in', 'virtual_out')
ORDER BY sb.qty_on_hand ASC;
