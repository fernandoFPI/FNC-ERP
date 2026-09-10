-- Read-only diagnostic. No writes, no lock beyond ordinary SELECT
-- snapshot isolation — safe to run anytime, including working hours.
--
-- Prompted by the G8 step 1 prod dry-run projection
-- (dry_run_g8_step1_prod_projection.sql) returning BEFORE=1778,
-- AFTER=1766 — migration 255 only closed 12 rows on prod, vs. 3977/3983
-- (99.8%) on dev. Two things need explaining before merge:
--   1. Does 'opening_balance' already exist as a source_type in prod's
--      stock_moves from something other than these migrations (e.g. the
--      legacy MySQL import)? The dry run's per-company report showed
--      rows_posted=1778 for source_type='opening_balance', but the dry
--      run itself only inserted 12 rows — so ~1766 already existed.
--   2. What's the actual shape of the 1766 rows migration 255 doesn't
--      touch — which location types and which sign of drift are they?
--      255 only targets real locations (warehouse/site) with POSITIVE
--      drift; if most of prod's drift is negative, or at virtual/transit
--      locations, or something else entirely, G8 step 1 as currently
--      scoped won't get prod anywhere near zero rows, and needs to be
--      rescoped before merging.
--
-- Usage: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/diagnose_prod_residual_drift.sql

\set ON_ERROR_STOP on

-- ── 1. Does 'opening_balance' already exist from something else? ───────
SELECT
  CASE
    WHEN notes LIKE 'Opening balance backfill (G8 step 1)%' THEN 'G8 migration 255'
    WHEN notes LIKE 'G8 step 1 follow-up%' THEN 'G8 migration 256'
    ELSE 'OTHER / PRE-EXISTING'
  END AS origin,
  COUNT(*) AS rows,
  MIN(moved_at) AS earliest_moved_at,
  MAX(moved_at) AS latest_moved_at,
  COUNT(DISTINCT moved_by) AS distinct_moved_by,
  COUNT(*) FILTER (WHERE superseded_at IS NOT NULL) AS superseded_count
FROM stock_moves
WHERE source_type = 'opening_balance'
GROUP BY 1
ORDER BY 1;

-- Sample of whatever's classified OTHER/PRE-EXISTING above, to see what
-- it actually is (notes text, who/what created it).
SELECT product_id, from_location_id, to_location_id, qty, unit_cost,
       moved_at, moved_by, superseded_at, notes
FROM stock_moves
WHERE source_type = 'opening_balance'
  AND notes NOT LIKE 'Opening balance backfill (G8 step 1)%'
  AND notes NOT LIKE 'G8 step 1 follow-up%'
ORDER BY moved_at
LIMIT 10;

-- ── 2. Shape of the full current drift population ──────────────────────
-- Same ledger-vs-balance computation as stock_ledger_reconciliation.sql,
-- broken down by location type and sign of drift, so we can see exactly
-- what migration 255's WHERE clause (real location, positive drift) is
-- and isn't catching.
WITH ledger AS (
  SELECT product_id, to_location_id AS location_id, lot_id, qty AS delta FROM stock_moves WHERE superseded_at IS NULL
  UNION ALL
  SELECT product_id, from_location_id AS location_id, lot_id, -qty AS delta FROM stock_moves WHERE superseded_at IS NULL
),
computed AS (
  SELECT product_id, location_id, lot_id, SUM(delta) AS ledger_qty
  FROM ledger GROUP BY product_id, location_id, lot_id
),
drifted AS (
  SELECT
    COALESCE(c.product_id, sb.product_id) AS product_id,
    COALESCE(c.location_id, sb.location_id) AS location_id,
    COALESCE(sb.qty_on_hand, 0) - COALESCE(c.ledger_qty, 0) AS drift
  FROM computed c
  FULL OUTER JOIN stock_balances sb
    ON sb.product_id = c.product_id
   AND sb.location_id = c.location_id
   AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
  WHERE ABS(COALESCE(sb.qty_on_hand, 0) - COALESCE(c.ledger_qty, 0)) > 0.0001
)
SELECT
  sl.type AS location_type,
  CASE WHEN d.drift > 0 THEN 'positive' ELSE 'negative' END AS drift_sign,
  COUNT(*) AS rows,
  SUM(ABS(d.drift)) AS total_abs_qty
FROM drifted d
JOIN stock_locations sl ON sl.id = d.location_id
GROUP BY sl.type, drift_sign
ORDER BY rows DESC;

-- ── 3. Sample of drifted rows migration 255 does NOT target ────────────
-- (i.e. NOT a real location with positive drift) so we can see concretely
-- what's left out — product, location, drift, and whether there's any
-- prior move history at all for that (product, location, lot).
WITH ledger AS (
  SELECT product_id, to_location_id AS location_id, lot_id, qty AS delta FROM stock_moves WHERE superseded_at IS NULL
  UNION ALL
  SELECT product_id, from_location_id AS location_id, lot_id, -qty AS delta FROM stock_moves WHERE superseded_at IS NULL
),
computed AS (
  SELECT product_id, location_id, lot_id, SUM(delta) AS ledger_qty
  FROM ledger GROUP BY product_id, location_id, lot_id
),
drifted AS (
  SELECT
    COALESCE(c.product_id, sb.product_id) AS product_id,
    COALESCE(c.location_id, sb.location_id) AS location_id,
    COALESCE(sb.qty_on_hand, 0) - COALESCE(c.ledger_qty, 0) AS drift
  FROM computed c
  FULL OUTER JOIN stock_balances sb
    ON sb.product_id = c.product_id
   AND sb.location_id = c.location_id
   AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
  WHERE ABS(COALESCE(sb.qty_on_hand, 0) - COALESCE(c.ledger_qty, 0)) > 0.0001
)
SELECT
  p.sku, p.name AS product_name, sl.name AS location_name, sl.type AS location_type,
  d.drift,
  (SELECT COUNT(*) FROM stock_moves sm
   WHERE sm.product_id = d.product_id
     AND (sm.from_location_id = d.location_id OR sm.to_location_id = d.location_id)) AS prior_move_count
FROM drifted d
JOIN products p ON p.id = d.product_id
JOIN stock_locations sl ON sl.id = d.location_id
WHERE NOT (sl.type NOT IN ('transit', 'virtual_in', 'virtual_out') AND d.drift > 0)
ORDER BY ABS(d.drift) DESC
LIMIT 20;
