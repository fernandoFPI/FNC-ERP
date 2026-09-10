-- Read-only dry-run projection for migrations 255 + 256 (G8 step 1) on
-- prod. Applies both migrations' exact logic (copied verbatim from the
-- migration files, minus their own BEGIN/COMMIT — this script wraps in
-- its own transaction that's always rolled back) inside one transaction,
-- including the ALTER TABLE ... DISABLE/ENABLE TRIGGER pair, so the
-- projection matches the real migrations' actual behavior and locking
-- exactly, not an approximation of it. That means this script needs the
-- same privilege the real migrations do (table owner, or a role granted
-- ALTER on stock_moves — not just SELECT) and can't run against a
-- read-only replica. Reports before/after reconciliation counts, a
-- per-company qty/value breakdown, and a cost-basis tier breakdown (now
-- exact — read directly from each row's notes, not reconstructed), then
-- rolls everything back. Nothing persists — safe to run on prod as many
-- times as needed.
--
-- Note: cost tier is now labeled last_cost, not average_cost —
-- stock_balances.average_cost is populated by the trigger with the last
-- recorded move cost (migration 203), not a true weighted average. See
-- migration 255's header for the full G8 follow-up list (true weighted-
-- average costing, landed cost, and a cost-only revaluation move for the
-- zero-cost rows this backfill flags).
--
-- Lock note: like the real migrations, this script's DISABLE TRIGGER
-- takes an ACCESS EXCLUSIVE lock on stock_moves for the life of the
-- transaction. It always rolls back, but for the duration of the run it
-- blocks all reads/writes to that table exactly like a real deploy would
-- — run it outside working hours too, not just the real migrations.
--
-- Usage: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/dry_run_g8_step1_prod_projection.sql

\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE stock_moves DISABLE TRIGGER trg_update_stock_balance;

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
  FROM stock_moves WHERE superseded_at IS NULL
  UNION ALL
  SELECT product_id, from_location_id AS location_id, lot_id, -qty AS delta, moved_at
  FROM stock_moves WHERE superseded_at IS NULL
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
costed AS (
  SELECT
    t.*,
    p.standard_cost,
    CASE
      WHEN NULLIF(t.average_cost, 0) IS NOT NULL THEN t.average_cost
      WHEN NULLIF(p.standard_cost, 0) IS NOT NULL THEN p.standard_cost
      ELSE 0
    END AS unit_cost,
    CASE
      WHEN NULLIF(t.average_cost, 0) IS NOT NULL THEN 'last_cost'
      WHEN NULLIF(p.standard_cost, 0) IS NOT NULL THEN 'standard_cost'
      ELSE 'zero'
    END AS cost_tier
  FROM target t
  JOIN products p ON p.id = t.product_id
),
inserted AS (
  INSERT INTO stock_moves (
    company_id, product_id, from_location_id, to_location_id, lot_id,
    moved_at, qty, unit_cost, total_cost, source_type, notes, moved_by
  )
  SELECT
    c.company_id,
    c.product_id,
    vloc.id,
    c.location_id,
    c.lot_id,
    COALESCE(c.earliest_move_at - INTERVAL '1 second', c.balance_updated_at, NOW()),
    c.drift,
    c.unit_cost,
    c.drift * c.unit_cost,
    'opening_balance',
    CASE c.cost_tier
      WHEN 'last_cost' THEN
        'Opening balance backfill (G8 step 1) — legacy import never recorded this quantity as a stock_moves row; reconstructed from the stock_balances/stock_moves drift. Cost basis: last_cost (' || c.unit_cost || ').'
      WHEN 'standard_cost' THEN
        'Opening balance backfill (G8 step 1) — legacy import never recorded this quantity as a stock_moves row; reconstructed from the stock_balances/stock_moves drift. Cost basis: standard_cost (' || c.unit_cost || ') — no last_cost was recorded.'
      ELSE
        'Opening balance backfill (G8 step 1) — legacy import never recorded this quantity as a stock_moves row; reconstructed from the stock_balances/stock_moves drift. Cost basis: none available (no last_cost or standard_cost). FLAGGED for Finance/costing review — candidate for a future cost-only revaluation move once a real cost basis exists.'
    END,
    NULL
  FROM costed c
  CROSS JOIN LATERAL (
    SELECT id FROM stock_locations
    WHERE company_id = c.company_id AND type = 'virtual_in' AND is_active = true
    LIMIT 1
  ) vloc
  RETURNING product_id, from_location_id AS virtual_in_id, lot_id, qty
)
UPDATE stock_balances sb
SET qty_on_hand = sb.qty_on_hand - i.qty,
    updated_at = NOW()
FROM inserted i
WHERE sb.product_id = i.product_id
  AND sb.location_id = i.virtual_in_id
  AND sb.lot_id IS NOT DISTINCT FROM i.lot_id;

-- ── Migration 256 (verbatim body — case 1 only, per the shipped file) ──
WITH want(sku, location_name, drift) AS (
  VALUES ('PVC-063', 'Warehouse', -2.0), ('PVC-063', 'Factory Main Warehouse', -2.0),
         ('PLMB-800', 'Warehouse', -1.0), ('PLMB-800', 'Factory Main Warehouse', -1.0)
),
target AS (
  SELECT
    p.id AS product_id, sl.id AS location_id, sl.company_id, ABS(want.drift) AS qty,
    p.standard_cost,
    CASE
      WHEN NULLIF(sb.average_cost, 0) IS NOT NULL THEN sb.average_cost
      WHEN NULLIF(p.standard_cost, 0) IS NOT NULL THEN p.standard_cost
      ELSE 0
    END AS unit_cost,
    CASE
      WHEN NULLIF(sb.average_cost, 0) IS NOT NULL THEN 'last_cost'
      WHEN NULLIF(p.standard_cost, 0) IS NOT NULL THEN 'standard_cost'
      ELSE 'zero'
    END AS cost_tier
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
superseded AS (
  UPDATE stock_moves sm
  SET superseded_at = NOW()
  FROM target t
  WHERE sm.product_id = t.product_id
    AND sm.to_location_id = t.location_id
    AND sm.superseded_at IS NULL
    AND sm.notes LIKE 'Reconciliation — pre-existing negative balance found during G9 stock-locking audit%'
  RETURNING sm.product_id, sm.to_location_id AS location_id
),
inserted AS (
  INSERT INTO stock_moves (
    company_id, product_id, from_location_id, to_location_id,
    moved_at, qty, unit_cost, total_cost, source_type, notes, moved_by
  )
  SELECT
    t.company_id, t.product_id, vloc.id, t.location_id,
    NOW(), t.qty, t.unit_cost, t.qty * t.unit_cost,
    'opening_balance',
    CASE t.cost_tier
      WHEN 'last_cost' THEN
        'G8 step 1 follow-up — replaces an earlier ad-hoc fix (this session, pre-dating the opening-balance backfill) that under-corrected this row''s negative drift; that fix is now superseded, this row is the full corrected quantity. Cost basis: last_cost (' || t.unit_cost || ').'
      WHEN 'standard_cost' THEN
        'G8 step 1 follow-up — replaces an earlier ad-hoc fix (this session, pre-dating the opening-balance backfill) that under-corrected this row''s negative drift; that fix is now superseded, this row is the full corrected quantity. Cost basis: standard_cost (' || t.unit_cost || ') — no last_cost was recorded.'
      ELSE
        'G8 step 1 follow-up — replaces an earlier ad-hoc fix (this session, pre-dating the opening-balance backfill) that under-corrected this row''s negative drift; that fix is now superseded, this row is the full corrected quantity. Cost basis: none available. FLAGGED for Finance/costing review — candidate for a future cost-only revaluation move once a real cost basis exists.'
    END,
    NULL
  FROM target t
  JOIN superseded s ON s.product_id = t.product_id AND s.location_id = t.location_id
  CROSS JOIN LATERAL (
    SELECT id FROM stock_locations WHERE company_id = t.company_id AND type = 'virtual_in' AND is_active = true LIMIT 1
  ) vloc
  RETURNING product_id, to_location_id AS location_id, qty
)
UPDATE stock_balances sb
SET qty_on_hand = sb.qty_on_hand + i.qty,
    updated_at = NOW()
FROM inserted i
WHERE sb.product_id = i.product_id
  AND sb.location_id = i.location_id
  AND sb.lot_id IS NULL;

ALTER TABLE stock_moves ENABLE TRIGGER trg_update_stock_balance;

-- ── AFTER ─────────────────────────────────────────────────────────────
-- If this isn't 2, run stock_ledger_reconciliation.sql for real (not this
-- dry run) to see exactly which rows remain — expect only prod-specific
-- exceptions analogous to dev's FNF-CEM-001 case (see migration 256's own
-- header comment), not a sign anything here is broken. Migration 256's
-- own WHERE clause is a no-op on any database that doesn't have the exact
-- pre-existing drift it expects (e.g. prod, if it never had the earlier
-- ad-hoc PVC-063/PLMB-800 fix) — in that case AFTER will be higher than 2,
-- reflecting whatever prod-specific exceptions actually exist there.
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

-- ── Real-location negative balances ─────────────────────────────────────
-- Sanity check: the trigger's guard (migration 254) should never let a
-- real location go negative, but this backfill runs with the trigger
-- disabled, so it's worth confirming explicitly that nothing here pushed
-- one negative regardless.
SELECT 'NEGATIVE_REAL_LOCATIONS' AS phase, COUNT(*) AS count
FROM stock_balances sb
JOIN stock_locations sl ON sl.id = sb.location_id
WHERE sb.qty_on_hand < 0 AND sl.type NOT IN ('virtual_in', 'virtual_out', 'transit');

-- ── Per-company qty/value posted ─────────────────────────────────────
SELECT c.name AS company, COUNT(*) AS rows_posted,
       SUM(sm.qty) AS total_qty, SUM(sm.total_cost) AS total_value
FROM stock_moves sm
JOIN companies c ON c.id = sm.company_id
WHERE sm.source_type = 'opening_balance'
GROUP BY c.name ORDER BY c.name;

-- ── Cost-tier breakdown (exact — read from each row's own notes, which
-- now records the tier that actually fired for it, not a reconstruction) ──
SELECT
  c.name AS company,
  COUNT(*) FILTER (WHERE sm.notes LIKE '%Cost basis: last_cost%') AS last_cost_rows,
  COUNT(*) FILTER (WHERE sm.notes LIKE '%Cost basis: standard_cost%') AS standard_cost_rows,
  COUNT(*) FILTER (WHERE sm.notes LIKE '%Cost basis: none available%') AS zero_flagged_rows,
  SUM(sm.qty) FILTER (WHERE sm.notes LIKE '%Cost basis: none available%') AS zero_flagged_qty,
  ROUND(100.0 * SUM(sm.qty) FILTER (WHERE sm.notes LIKE '%Cost basis: none available%') / NULLIF(SUM(sm.qty), 0), 1) AS zero_flagged_qty_pct,
  COUNT(*) AS total
FROM stock_moves sm
JOIN companies c ON c.id = sm.company_id
WHERE sm.source_type = 'opening_balance'
GROUP BY c.name ORDER BY c.name;

ROLLBACK;
