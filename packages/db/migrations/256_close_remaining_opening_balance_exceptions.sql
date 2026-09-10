-- G8 step 1 follow-up: closes one exception category migration 255
-- deliberately left out of its general rule. Matched by SKU (not
-- location/product UUIDs, which differ between databases) and guarded by
-- an assertion of the exact drift currently expected — if a database
-- doesn't have this precise history (e.g. prod, if it never had the
-- earlier ad-hoc fix that created it), the assertion finds no matching
-- row, nothing is superseded, and this is a no-op there.
--
-- A second exception (FNF-CEM-001, a symmetric Virtual Receipts /
-- Virtual Consumption drift) was investigated and deliberately left OUT
-- of this migration: its stock_balances row pairs a company-2 product
-- with a company-1 "Virtual Receipts" location — a genuine cross-company
-- data anomaly, not a same-company virtual-pair mismatch. Left for manual
-- investigation — same treatment as CABLE-029 earlier in this effort.
--
-- PVC-063 / PLMB-800 at "Warehouse" and "Factory Main Warehouse": these
-- went negative from a pure legacy-import gap like everything else in
-- migration 255's scope, but were manually "fixed" to exactly 0 earlier
-- this session, before migration 255 (or the concept of an opening-
-- balance ledger) existed. That earlier fix posted a live adjustment move
-- (qty 2/2/1/1) assuming the true value was 0; migration 255 correctly
-- excluded these from its automated backfill since their drift is
-- negative. In hindsight the earlier fix under-corrected: the ledger,
-- including that adjustment, said these locations should hold 2/2/1/1
-- units, and the balance (still 0) hadn't caught up.
--
-- Mechanics — this needed a different technique than 255's, and it's
-- worth being explicit about why. 255's rows have no pre-existing move at
-- all, so a single plain insert is free to represent the full truth. Here
-- there already IS a live move (the earlier adjustment) representing
-- part of the truth, so a second plain insert on top would double-count
-- it in the ledger. This migration instead REPLACES that move outright —
-- the established correction pattern already used elsewhere in this
-- codebase (see reverseAndRepostStockMove): mark the old move
-- superseded_at = NOW() (a metadata-only change; superseding a row never
-- alters stock_balances, since the trigger only fires on INSERT), then
-- insert one new PLAIN move for the full target quantity, not just the
-- remainder. With trg_update_stock_balance disabled for this migration,
-- that insert has no balance effect either — the only explicit change is
-- adding the full target quantity to the real location, which is exactly
-- what it was missing. virtual_in needs no adjustment at all: its balance
-- already reflects the old move's original, real physical effect (from
-- when that move actually ran, superseding it now doesn't undo that),
-- and the ledger's net contribution from this product/location — old
-- move's -qty now excluded, replaced by the new move's own -qty — is
-- unchanged, so virtual_in stays exactly as reconciled as it already was.
-- Net result: no superseded_at anywhere in a newly-authored balance
-- figure, no raw stock_balances compensation on either side beyond the
-- one genuinely-needed real-location change, and the only row marked
-- superseded is the pre-existing one it replaces — precisely the
-- pattern findStockMovesForCorrection already expects.

BEGIN;

ALTER TABLE stock_moves DISABLE TRIGGER trg_update_stock_balance;

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
      WHEN NULLIF(sb.average_cost, 0) IS NOT NULL THEN 'average_cost'
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
      WHEN 'average_cost' THEN
        'G8 step 1 follow-up — replaces an earlier ad-hoc fix (this session, pre-dating the opening-balance backfill) that under-corrected this row''s negative drift; that fix is now superseded, this row is the full corrected quantity. Cost basis: average_cost (' || t.unit_cost || ').'
      WHEN 'standard_cost' THEN
        'G8 step 1 follow-up — replaces an earlier ad-hoc fix (this session, pre-dating the opening-balance backfill) that under-corrected this row''s negative drift; that fix is now superseded, this row is the full corrected quantity. Cost basis: standard_cost (' || t.unit_cost || ') — no average_cost was recorded.'
      ELSE
        'G8 step 1 follow-up — replaces an earlier ad-hoc fix (this session, pre-dating the opening-balance backfill) that under-corrected this row''s negative drift; that fix is now superseded, this row is the full corrected quantity. Cost basis: none available. FLAGGED for Finance/costing review.'
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

COMMIT;
