-- G8 step 1: backfills a real, ledger-visible opening-balance move for
-- every real-location stock_balances row whose quantity has no move
-- history to explain it — the legacy data import wrote balances directly
-- without ever recording how they got there. Confirmed via
-- packages/db/scripts/stock_ledger_reconciliation.sql: ~3,984 drifted
-- rows on dev, and the same pattern on prod, almost all with zero prior
-- stock_moves for that product/location/lot.
--
-- Scope: only drifted rows at REAL locations (warehouse/site) with
-- POSITIVE drift — i.e. an unrecorded receipt, the overwhelming majority
-- of the backlog. Explicitly excludes:
--   * negative-drift rows at real locations — the reconciliation script
--     found 4 of these on dev (PVC-063/PLMB-800 at two locations each),
--     and they are NOT legacy-import gaps: they're a residual side effect
--     of an earlier ad-hoc reconciliation adjustment made this session,
--     before this backfill's existence was known. See migration 256,
--     which closes them with a different technique.
--
-- Per-row opening-balance move:
--   * source_type = 'opening_balance' (new value; stock_moves.source_type
--     has no CHECK constraint, so this needs no schema change).
--   * virtual_in -> the drifted location, qty = drift. Inserted as a
--     plain, live row — not superseded. See the mechanics note below for
--     why that's now possible.
--   * moved_at: if the location already has real move history for this
--     product/lot, dated one second before the earliest such move (so the
--     ledger reads as "this stock already existed, then real activity
--     happened on top of it"); otherwise the stock_balances row's own
--     updated_at, which — for a row with zero move history — has never
--     been touched since the import itself.
--   * unit_cost: average_cost if recorded (>0), else the product's
--     standard_cost if set (>0), else 0. The tier actually used is
--     recorded in the notes text itself (not just inferable from the
--     number), since which one fired isn't otherwise reconstructable
--     later — and when it falls all the way to 0, the notes are flagged
--     for a Finance/costing review, since G8's later step (restoring real
--     average-cost computation in the trigger) needs a real cost basis to
--     replay from and won't have one for these.
--
-- Does not touch the trigger's costing logic (still "last recorded
-- cost", per migration 203) — that is a separate, later G8 step.
--
-- Mechanics — why the trigger is disabled for this migration, and why
-- these rows need no superseded_at at all (this took three attempts to
-- get right; kept so it isn't re-derived):
--
-- A plain insert lets the trigger update qty_on_hand on both sides by the
-- same delta that also lands in the ledger sum for both sides — so aading
-- a live move can never, by itself, change either side's own drift,
-- whatever quantity is chosen. Compensating the real-location side back
-- down afterward (what this migration used to do, via a direct
-- stock_balances UPDATE once the trigger had already applied the insert)
-- reaches the right balance, but the compensation itself is a write to
-- stock_balances with no stock_moves row behind it — exactly the kind of
-- untracked patch stock_ledger_reconciliation.sql exists to catch, just
-- introduced by the fix meant to close those.
--
-- The trigger-disabled version avoids that: with
-- trg_update_stock_balance off, the insert itself has zero effect on
-- either location's qty_on_hand. Only the virtual_in side needs a real
-- change — it has never had this quantity subtracted from it before, and
-- unlike the real-location side (whose balance already includes the
-- phantom import quantity and must not move), virtual_in genuinely needs
-- the debit for double-entry to hold. So: insert the move plain (it's
-- correctly counted in the real location's ledger, which needed exactly
-- this to catch up to the balance it already has), then apply the
-- virtual_in decrement directly via stock_balances, since nothing else
-- will. The real-location side is deliberately left completely untouched
-- — no insert effect (trigger off) and no explicit update either. Both
-- sides land on their correct values, and the only non-trigger write is
-- the one side that genuinely needs a first-time correction (virtual_in),
-- not a compensation for the trigger's own side effects.

BEGIN;

ALTER TABLE stock_moves DISABLE TRIGGER trg_update_stock_balance;

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
      WHEN NULLIF(t.average_cost, 0) IS NOT NULL THEN 'average_cost'
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
      WHEN 'average_cost' THEN
        'Opening balance backfill (G8 step 1) — legacy import never recorded this quantity as a stock_moves row; reconstructed from the stock_balances/stock_moves drift. Cost basis: average_cost (' || c.unit_cost || ').'
      WHEN 'standard_cost' THEN
        'Opening balance backfill (G8 step 1) — legacy import never recorded this quantity as a stock_moves row; reconstructed from the stock_balances/stock_moves drift. Cost basis: standard_cost (' || c.unit_cost || ') — no average_cost was recorded.'
      ELSE
        'Opening balance backfill (G8 step 1) — legacy import never recorded this quantity as a stock_moves row; reconstructed from the stock_balances/stock_moves drift. Cost basis: none available (no average_cost or standard_cost). FLAGGED for Finance/costing review before G8''s average-cost restoration replays this ledger.'
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

ALTER TABLE stock_moves ENABLE TRIGGER trg_update_stock_balance;

COMMIT;
