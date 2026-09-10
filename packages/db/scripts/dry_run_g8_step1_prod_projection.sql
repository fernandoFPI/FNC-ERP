-- Read-only dry-run projection for migrations 255 + 256 (G8 step 1) on
-- prod. Applies both migrations' exact logic (copied verbatim from the
-- migration files, minus their own BEGIN/COMMIT) inside one transaction,
-- reports before/after reconciliation counts, a per-company qty/value
-- breakdown, and a cost-basis tier breakdown, then rolls everything back.
-- Nothing persists — safe to run on prod as many times as needed.
--
-- Usage: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/dry_run_g8_step1_prod_projection.sql

\set ON_ERROR_STOP on
BEGIN;

-- ── BEFORE ────────────────────────────────────────────────────────────
SELECT 'BEFORE' AS phase, COUNT(*) AS drifted_rows
FROM (
  WITH ledger AS (
    SELECT product_id, to_location_id AS location_id, lot_id, qty AS delta FROM stock_moves WHERE superseded_at IS NULL
    UNION ALL
    SELECT product_id, from_location_id AS location_id, lot_id, -qty AS delta FROM stock_moves WHERE superseded_at IS NULL
  ),
  computed AS (
    SELECT product_id, location_id, lot_id, SUM(delta) AS ledger_qty
    FROM ledger GROUP BY product_id, location_id, lot_id
  )
  SELECT 1 FROM computed c
  FULL OUTER JOIN stock_balances sb ON sb.product_id=c.product_id AND sb.location_id=c.location_id AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
  WHERE ABS(COALESCE(sb.qty_on_hand,0) - COALESCE(c.ledger_qty,0)) > 0.0001
) sub;

-- ── Migration 255 (verbatim body) ────────────────────────────────────
WITH ledger AS (
  SELECT product_id, to_location_id AS location_id, lot_id, qty AS delta, moved_at
  FROM stock_moves
  UNION ALL
  SELECT product_id, from_location_id AS location_id, lot_id, -qty AS delta, moved_at
  FROM stock_moves
),
computed AS (
  SELECT product_id, location_id, lot_id,
         SUM(delta) AS ledger_qty,
         MIN(moved_at) AS earliest_move_at
  FROM ledger
  GROUP BY product_id, location_id, lot_id
),
drifted AS (
  SELECT
    COALESCE(c.product_id, sb.product_id) AS product_id,
    COALESCE(c.location_id, sb.location_id) AS location_id,
    COALESCE(c.lot_id, sb.lot_id) AS lot_id,
    COALESCE(sb.qty_on_hand, 0) - COALESCE(c.ledger_qty, 0) AS drift,
    c.earliest_move_at,
    sb.average_cost,
    sb.updated_at AS balance_updated_at
  FROM computed c
  FULL OUTER JOIN stock_balances sb
    ON sb.product_id = c.product_id
   AND sb.location_id = c.location_id
   AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
),
target AS (
  SELECT d.*, sl.company_id, sl.type AS location_type
  FROM drifted d
  JOIN stock_locations sl ON sl.id = d.location_id
  WHERE ABS(d.drift) > 0.0001
    AND sl.type NOT IN ('transit', 'virtual_in', 'virtual_out')
    AND d.drift > 0
),
inserted AS (
  INSERT INTO stock_moves (
    company_id, product_id, from_location_id, to_location_id, lot_id,
    moved_at, qty, unit_cost, total_cost, source_type, notes, moved_by
  )
  SELECT
    t.company_id,
    t.product_id,
    vloc.id,
    t.location_id,
    t.lot_id,
    COALESCE(t.earliest_move_at - INTERVAL '1 second', t.balance_updated_at, NOW()),
    t.drift,
    cost.unit_cost,
    t.drift * cost.unit_cost,
    'opening_balance',
    CASE
      WHEN cost.unit_cost = 0 THEN
        'Opening balance backfill (G8 step 1) — legacy import never recorded this quantity as a stock_moves row. No average_cost or standard_cost was available; cost basis defaulted to 0. FLAGGED for Finance/costing review before G8''s average-cost restoration replays this ledger.'
      ELSE
        'Opening balance backfill (G8 step 1) — legacy import never recorded this quantity as a stock_moves row; reconstructed from the stock_balances/stock_moves drift.'
    END,
    NULL
  FROM target t
  JOIN products p ON p.id = t.product_id
  CROSS JOIN LATERAL (
    SELECT id FROM stock_locations
    WHERE company_id = t.company_id AND type = 'virtual_in' AND is_active = true
    LIMIT 1
  ) vloc
  CROSS JOIN LATERAL (
    SELECT COALESCE(NULLIF(t.average_cost, 0), NULLIF(p.standard_cost, 0), 0) AS unit_cost
  ) cost
  RETURNING product_id, to_location_id AS location_id, lot_id, qty
)
UPDATE stock_balances sb
SET qty_on_hand = sb.qty_on_hand - i.qty,
    updated_at = NOW()
FROM inserted i
WHERE sb.product_id = i.product_id
  AND sb.location_id = i.location_id
  AND sb.lot_id IS NOT DISTINCT FROM i.lot_id;

-- ── Migration 256 (verbatim body — case 1 only, per the shipped file) ──
WITH want(sku, location_name, drift) AS (
  VALUES ('PVC-063', 'Warehouse', -2.0), ('PVC-063', 'Factory Main Warehouse', -2.0),
         ('PLMB-800', 'Warehouse', -1.0), ('PLMB-800', 'Factory Main Warehouse', -1.0)
),
target AS (
  SELECT p.id AS product_id, sl.id AS location_id, sl.company_id, ABS(want.drift) AS qty,
         COALESCE(NULLIF(sb.average_cost, 0), NULLIF(p.standard_cost, 0), 0) AS unit_cost
  FROM want
  JOIN products p ON p.sku = want.sku
  JOIN stock_locations sl ON sl.name = want.location_name AND sl.company_id = p.company_id AND sl.type IN ('warehouse', 'site')
  JOIN stock_balances sb ON sb.product_id = p.id AND sb.location_id = sl.id AND sb.lot_id IS NULL
  WHERE (
    sb.qty_on_hand - (
      SELECT COALESCE(SUM(CASE WHEN sm.to_location_id = sl.id THEN sm.qty WHEN sm.from_location_id = sl.id THEN -sm.qty ELSE 0 END), 0)
      FROM stock_moves sm
      WHERE sm.product_id = p.id AND (sm.from_location_id = sl.id OR sm.to_location_id = sl.id)
        AND sm.lot_id IS NULL AND sm.superseded_at IS NULL
    )
  ) = want.drift
),
inserted AS (
  INSERT INTO stock_moves (
    company_id, product_id, from_location_id, to_location_id,
    moved_at, qty, unit_cost, total_cost, source_type, notes, moved_by, superseded_at
  )
  SELECT
    t.company_id, t.product_id, vloc.id, t.location_id,
    NOW(), t.qty, t.unit_cost, t.qty * t.unit_cost,
    'opening_balance',
    'G8 step 1 follow-up — superseded top-up closing the remainder left after an earlier ad-hoc fix (this session, pre-dating the opening-balance backfill) under-corrected this row''s negative drift. The earlier adjustment move (still live) is the ledger''s documentation for this quantity; this row only exists to bring qty_on_hand to match it, and virtual_in''s side of it is compensated back below.',
    NULL, NOW()
  FROM target t
  CROSS JOIN LATERAL (
    SELECT id FROM stock_locations WHERE company_id = t.company_id AND type = 'virtual_in' AND is_active = true LIMIT 1
  ) vloc
  RETURNING product_id, from_location_id AS virtual_in_id, qty
)
UPDATE stock_balances sb
SET qty_on_hand = sb.qty_on_hand + i.qty,
    updated_at = NOW()
FROM inserted i
WHERE sb.product_id = i.product_id
  AND sb.location_id = i.virtual_in_id
  AND sb.lot_id IS NULL;

-- ── AFTER ─────────────────────────────────────────────────────────────
-- If this isn't 0, run stock_ledger_reconciliation.sql for real (not this
-- dry run) to see exactly which rows remain — expect only prod-specific
-- exceptions analogous to dev's FNF-CEM-001 case (see migration 256's own
-- header comment), not a sign anything here is broken.
SELECT 'AFTER' AS phase, COUNT(*) AS drifted_rows
FROM (
  WITH ledger AS (
    SELECT product_id, to_location_id AS location_id, lot_id, qty AS delta FROM stock_moves WHERE superseded_at IS NULL
    UNION ALL
    SELECT product_id, from_location_id AS location_id, lot_id, -qty AS delta FROM stock_moves WHERE superseded_at IS NULL
  ),
  computed AS (
    SELECT product_id, location_id, lot_id, SUM(delta) AS ledger_qty
    FROM ledger GROUP BY product_id, location_id, lot_id
  )
  SELECT 1 FROM computed c
  FULL OUTER JOIN stock_balances sb ON sb.product_id=c.product_id AND sb.location_id=c.location_id AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
  WHERE ABS(COALESCE(sb.qty_on_hand,0) - COALESCE(c.ledger_qty,0)) > 0.0001
) sub;

-- ── Per-company qty/value posted ─────────────────────────────────────
SELECT c.name AS company, COUNT(*) AS rows_posted,
       SUM(sm.qty) AS total_qty, SUM(sm.total_cost) AS total_value
FROM stock_moves sm
JOIN companies c ON c.id = sm.company_id
WHERE sm.source_type = 'opening_balance'
GROUP BY c.name ORDER BY c.name;

-- ── Cost-tier breakdown ───────────────────────────────────────────────
-- zero_flagged is exact (unit_cost = 0, matches the FLAGGED notes text).
-- The average_cost/standard_cost split is a best-effort reconstruction
-- (unit_cost compared against the product's current standard_cost), not
-- a stored fact — see the accompanying report for why a fully certain
-- split isn't recoverable after the fact.
SELECT
  COUNT(*) FILTER (WHERE sm.unit_cost = 0) AS zero_flagged,
  COUNT(*) FILTER (WHERE sm.unit_cost > 0 AND sm.unit_cost = p.standard_cost AND p.standard_cost > 0) AS matches_standard_cost,
  COUNT(*) FILTER (WHERE sm.unit_cost > 0 AND (sm.unit_cost != p.standard_cost OR p.standard_cost = 0)) AS used_average_cost,
  COUNT(*) AS total
FROM stock_moves sm
JOIN products p ON p.id = sm.product_id
WHERE sm.source_type = 'opening_balance';

ROLLBACK;
