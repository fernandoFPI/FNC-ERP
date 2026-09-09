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
--     before this backfill's existence was known. Backfilling them the
--     same way as everything else (an inbound virtual_in -> location
--     move) would be semantically backwards for a negative drift, and the
--     only correct direction (location -> virtual_in) would immediately
--     trip migration 254's negative-balance guard, since these locations
--     are already sitting at exactly 0. Left for manual review — do not
--     add them to this backfill without first re-checking whether they
--     still apply on the target database (they may not exist on prod at
--     all, since they trace back to a dev-only fix).
--
-- Per-row opening-balance move:
--   * source_type = 'opening_balance' (new value; stock_moves.source_type
--     has no CHECK constraint, so this needs no schema change).
--   * virtual_in -> the drifted location, qty = drift.
--   * moved_at: if the location already has real move history for this
--     product/lot, dated one second before the earliest such move (so the
--     ledger reads as "this stock already existed, then real activity
--     happened on top of it"); otherwise the stock_balances row's own
--     updated_at, which — for a row with zero move history — has never
--     been touched since the import itself.
--   * unit_cost: average_cost if recorded (>0), else the product's
--     standard_cost if set (>0), else 0 — and when it falls all the way
--     to 0, the notes field is flagged for a Finance/costing review,
--     since G8's later step (restoring real average-cost computation in
--     the trigger) needs a real cost basis to replay from and won't have
--     one for these.
--
-- Does not touch the trigger's costing logic (still "last recorded
-- cost", per migration 203) — that is a separate, later G8 step.
--
-- On letting the trigger run vs. not (this took two attempts to get
-- right — noting the reasoning so it isn't re-litigated): the naive
-- approach of just inserting these moves normally double-counts, because
-- stock_balances.qty_on_hand at the real (to_location) side already
-- includes the phantom import quantity — that gap is the literal
-- definition of "drift". Letting the trigger add the same quantity again
-- pushes the balance further from the ledger, not closer (confirmed by
-- dry run: positive-drift count was completely unchanged after a
-- trigger-on backfill). But disabling the trigger entirely is also
-- wrong: the virtual_in (from_location) side has never had this quantity
-- subtracted from it either, and — unlike the real side — it genuinely
-- needs that decrement for double-entry to hold once a real ledger row
-- says stock left it. So: let the trigger run normally (it correctly
-- decrements virtual_in and increments the real location), then
-- immediately compensate ONLY the real-location side back down by the
-- same amount, using the INSERT's own RETURNING to target exactly the
-- rows just written. Net effect: virtual_in decremented (correct, new
-- information), real location unchanged (correct, already known),
-- ledger on both sides now matches their balances.

BEGIN;

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

COMMIT;
