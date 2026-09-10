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
--   * unit_cost: last_cost if recorded (>0) — stock_balances.average_cost,
--     despite its column name, is populated by the trigger with the last
--     recorded move cost (migration 203), not a true weighted average —
--     else the product's standard_cost if set (>0), else 0. The tier
--     actually used is recorded in the notes text itself (not just
--     inferable from the number), since which one fired isn't otherwise
--     reconstructable later — and when it falls all the way to 0, the
--     notes are flagged for a Finance/costing review: these rows have no
--     cost basis to replay from once G8 catches up on real costing, and
--     are candidates for a future cost-only revaluation move (see the G8
--     follow-up list below).
--
-- Does not touch the trigger's costing logic (still last_cost, per
-- migration 203). G8 follow-up items, not part of this migration:
--   * restoring true weighted-average cost computation in the trigger
--     (replacing last_cost).
--   * landed cost (freight/duty/handling folded into unit_cost, not just
--     the vendor line price).
--   * a cost-only revaluation move for the zero-cost opening rows this
--     migration flags (480 across dev, 5.5-6.9% of qty per company) —
--     once a real cost basis exists for them, closes the gap without
--     touching quantity or location.
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
--
-- That virtual_in decrement MUST be an upsert (INSERT ... ON CONFLICT DO
-- UPDATE), not a bare UPDATE — caught via a prod dry run after this
-- migration read as fully correct on dev, kept here because it's exactly
-- the kind of gap a clean-looking dry run doesn't surface on its own.
-- update_stock_balance() (migration 254) always upserts, since a
-- location's very first move has no existing stock_balances row to
-- UPDATE; the drifted real locations in `target` already have a row (that
-- row's existing balance is the drift itself), but virtual_in is looked
-- up completely independently via the LATERAL join below and has no such
-- guarantee — for any product whose company's virtual_in has never been
-- touched before, a bare UPDATE silently affects zero rows, the
-- compensation never happens, and a brand-new equal-magnitude drift
-- appears at virtual_in in place of the one just closed at the real
-- location. Dev never caught this because its virtual_in rows already
-- existed from testing this migration's very first (pre-redesign)
-- version, which went through the trigger — and a revert that came later
-- zeroed those rows' quantities back out but never deleted the rows
-- themselves, so every subsequent dev test of this redesign ran against
-- an environment where the missing-row case could no longer occur. Only
-- prod, which had genuinely never touched virtual_in for most of these
-- products, actually exercised it. The upsert below mirrors
-- update_stock_balance()'s own FROM-side logic exactly (same ON CONFLICT
-- targets, same NULL-lot partial index, same "set average_cost only on
-- first creation" behavior) so this compensation does precisely what the
-- trigger would have done had it fired for this insert.
--
-- Transaction safety: run-migrations.ts strips this file's own BEGIN/
-- COMMIT and re-wraps the whole body in its own per-file transaction
-- (BEGIN before, COMMIT after, ROLLBACK on any error — see
-- migrations/run-migrations.ts:55-65). ALTER TABLE ... DISABLE/ENABLE
-- TRIGGER is ordinary transactional DDL in Postgres, so a failure
-- anywhere between the two rolls the whole transaction back, including
-- the disable — the trigger can never be left off. The BEGIN;/COMMIT;
-- below are kept only so this file also reads correctly and runs
-- correctly standalone (e.g. via psql -f); they're redundant, not load-
-- bearing, under the real runner.
--
-- Deploy note: ALTER TABLE ... DISABLE TRIGGER takes an ACCESS EXCLUSIVE
-- lock on stock_moves for the life of the transaction — every read and
-- write against that table (including Store In/Store Out) blocks until
-- this migration commits. Run outside working hours.

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
  RETURNING product_id, from_location_id AS virtual_in_id, lot_id, qty, unit_cost, moved_at
),
compensated_no_lot AS (
  INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_move_at, updated_at)
  SELECT i.product_id, i.virtual_in_id, NULL, -i.qty, i.unit_cost, i.moved_at, NOW()
  FROM inserted i
  WHERE i.lot_id IS NULL
  ON CONFLICT (product_id, location_id) WHERE lot_id IS NULL
  DO UPDATE SET
    qty_on_hand  = stock_balances.qty_on_hand + EXCLUDED.qty_on_hand,
    last_move_at = EXCLUDED.last_move_at,
    updated_at   = NOW()
  RETURNING 1
),
compensated_lot AS (
  INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_move_at, updated_at)
  SELECT i.product_id, i.virtual_in_id, i.lot_id, -i.qty, i.unit_cost, i.moved_at, NOW()
  FROM inserted i
  WHERE i.lot_id IS NOT NULL
  ON CONFLICT (product_id, location_id, lot_id)
  DO UPDATE SET
    qty_on_hand  = stock_balances.qty_on_hand + EXCLUDED.qty_on_hand,
    last_move_at = EXCLUDED.last_move_at,
    updated_at   = NOW()
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM compensated_no_lot) AS no_lot_compensated,
       (SELECT COUNT(*) FROM compensated_lot) AS lot_compensated;

ALTER TABLE stock_moves ENABLE TRIGGER trg_update_stock_balance;

COMMIT;
