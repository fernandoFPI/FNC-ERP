-- G8 step 1 follow-up: closes one exception category migration 255
-- deliberately left out of its general rule (case 1 below). Matched by
-- SKU (not location/product UUIDs, which differ between databases) and
-- guarded by an assertion of the exact drift currently expected — if a
-- database doesn't have this precise history (e.g. prod, if it never had
-- the earlier ad-hoc fix that created it), the assertion simply finds no
-- matching row and this is a no-op there.
--
-- A second exception (FNF-CEM-001, a symmetric Virtual Receipts /
-- Virtual Consumption drift) was investigated and deliberately left OUT
-- of this migration: its stock_balances row pairs a company-2 product
-- with a company-1 "Virtual Receipts" location — a genuine cross-company
-- data anomaly, not a same-company virtual-pair mismatch like the ones
-- this migration and 255 both assume. Forcing it through the same-company
-- fix used here would silently paper over whatever actually produced a
-- cross-company balance row, rather than explain it. Left for manual
-- investigation — same treatment as CABLE-029 earlier in this effort.
--
-- The reasoning here took several wrong turns, kept because the next
-- person touching this (including future me) will otherwise re-walk them:
--
-- A live (non-superseded) move can never change a row's own drift — the
-- trigger moves qty_on_hand and the reconciliation ledger sum by the same
-- delta, always, so drift is invariant under any ordinary insert. A
-- superseded move (migration 231's correction-tracking column) breaks
-- that: the trigger still applies it to qty_on_hand, but it's excluded
-- from the ledger sum, so it can move a balance without moving what the
-- ledger claims to explain — which is what migration 255's general case
-- needs (the real location's balance is already correct; the ledger just
-- needs to catch up).
--
-- But every stock_moves row is inherently two-sided (from/to both NOT
-- NULL), so a superseded move ALSO silently changes its other side's
-- balance with no ledger credit — moving the "drift" problem there
-- instead of closing it. Migration 255 avoids this by using a live move
-- (so the untouched side stays symmetric, balance and ledger moving
-- together) and compensating only the target side back down via a direct
-- stock_balances UPDATE. The fix below needs the same kind of
-- compensation — but on the *other* side from migration 255's case,
-- combined with a superseded move rather than a live one, because here
-- the real location's balance is the one that's genuinely wrong (not
-- just undocumented) while its paired virtual_in was already correctly
-- reconciled beforehand and must not move at all.
--
-- PVC-063 / PLMB-800 at "Warehouse" and "Factory Main Warehouse":
-- these went negative from a pure legacy-import gap like everything else
-- in migration 255's scope, but were manually "fixed" to exactly 0 earlier
-- this session, before migration 255 (or the concept of an opening-balance
-- ledger) existed. That earlier fix posted a same-day live adjustment move
-- (qty 2/2/1/1) assuming the true value was 0; migration 255 correctly
-- excluded these from its automated backfill since their drift is
-- negative. In hindsight the earlier fix under-corrected: the ledger
-- (including that adjustment, which stays live) says these locations
-- should hold 2/2/1/1 units, and the balance (still 0) hasn't caught up.
-- Fix: a superseded top-up move (virtual_in -> the real location, qty =
-- the outstanding remainder) raises the real balance to match the
-- ledger's already-correct value, without adding to it a second time;
-- then a direct compensation restores virtual_in's balance, since that
-- side was already right and this move's only job was the real side.
--
-- Case 2 — FNF-CEM-001 at "Virtual Receipts" / "Virtual Consumption": a
-- symmetric, opposite-direction drift confined entirely to this product's
-- two virtual counter-entry locations, with zero drift at any real
-- location for it. Virtual locations have no independent physical
-- existence — their balance should always equal what the ledger says, so
-- unlike case 1 (a real location, where the balance is presumed correct
-- and the ledger needs to document it) the correction here moves the
-- balance to match the *existing* ledger on both sides via one
-- superseded move: Virtual Consumption -> Virtual Receipts, qty 10
-- (decrements Consumption's balance down to its ledger value of 8,
-- increments Receipts' balance up to its ledger value of -30 — both
-- exactly, no further compensation needed).

BEGIN;

-- Case 1
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

COMMIT;
