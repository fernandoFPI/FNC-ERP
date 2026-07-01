-- Fix: stock_balances unique constraint doesn't work for NULL lot_id in PostgreSQL
-- (NULL != NULL, so ON CONFLICT never fires for no-lot products)

-- Step 1: Consolidate duplicate rows where lot_id IS NULL
-- Keep one row per (product_id, location_id), summing qty_on_hand, using latest average_cost
WITH keeper AS (
  SELECT DISTINCT ON (product_id, location_id) id, product_id, location_id
  FROM stock_balances
  WHERE lot_id IS NULL
  ORDER BY product_id, location_id, updated_at DESC
),
totals AS (
  SELECT product_id, location_id,
         SUM(qty_on_hand) AS total_qty,
         SUM(qty_on_hand * average_cost) / NULLIF(SUM(GREATEST(qty_on_hand, 0)), 0) AS wavg_cost
  FROM stock_balances
  WHERE lot_id IS NULL
  GROUP BY product_id, location_id
)
UPDATE stock_balances sb
SET qty_on_hand  = t.total_qty,
    average_cost = COALESCE(t.wavg_cost, sb.average_cost),
    updated_at   = NOW()
FROM keeper k
JOIN totals t ON t.product_id = k.product_id AND t.location_id = k.location_id
WHERE sb.id = k.id;

-- Delete all non-keeper rows with null lot_id
DELETE FROM stock_balances
WHERE lot_id IS NULL
  AND id NOT IN (
    SELECT DISTINCT ON (product_id, location_id) id
    FROM stock_balances
    WHERE lot_id IS NULL
    ORDER BY product_id, location_id, updated_at DESC
  );

-- Step 2: Add partial unique index so ON CONFLICT works for NULL lot_id
CREATE UNIQUE INDEX IF NOT EXISTS stock_balances_no_lot_unique
  ON stock_balances (product_id, location_id) WHERE lot_id IS NULL;

-- Step 3: Replace trigger function to use partial index for NULL lot_id
CREATE OR REPLACE FUNCTION update_stock_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lot_id IS NULL THEN
    -- No lot: use partial index (NULL-safe)
    INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_move_at, updated_at)
    VALUES (NEW.product_id, NEW.from_location_id, NULL, -NEW.qty, NEW.unit_cost, NEW.moved_at, NOW())
    ON CONFLICT (product_id, location_id) WHERE lot_id IS NULL
    DO UPDATE SET
      qty_on_hand  = stock_balances.qty_on_hand - NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW();

    INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_move_at, updated_at)
    VALUES (NEW.product_id, NEW.to_location_id, NULL, NEW.qty, NEW.unit_cost, NEW.moved_at, NOW())
    ON CONFLICT (product_id, location_id) WHERE lot_id IS NULL
    DO UPDATE SET
      average_cost = CASE
        WHEN (stock_balances.qty_on_hand + NEW.qty) > 0
        THEN ((stock_balances.qty_on_hand * stock_balances.average_cost) + (NEW.qty * NEW.unit_cost))
             / (stock_balances.qty_on_hand + NEW.qty)
        ELSE NEW.unit_cost
      END,
      qty_on_hand  = stock_balances.qty_on_hand + NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW();
  ELSE
    -- With lot: use original three-column constraint
    INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_move_at, updated_at)
    VALUES (NEW.product_id, NEW.from_location_id, NEW.lot_id, -NEW.qty, NEW.unit_cost, NEW.moved_at, NOW())
    ON CONFLICT (product_id, location_id, lot_id)
    DO UPDATE SET
      qty_on_hand  = stock_balances.qty_on_hand - NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW();

    INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_move_at, updated_at)
    VALUES (NEW.product_id, NEW.to_location_id, NEW.lot_id, NEW.qty, NEW.unit_cost, NEW.moved_at, NOW())
    ON CONFLICT (product_id, location_id, lot_id)
    DO UPDATE SET
      average_cost = CASE
        WHEN (stock_balances.qty_on_hand + NEW.qty) > 0
        THEN ((stock_balances.qty_on_hand * stock_balances.average_cost) + (NEW.qty * NEW.unit_cost))
             / (stock_balances.qty_on_hand + NEW.qty)
        ELSE NEW.unit_cost
      END,
      qty_on_hand  = stock_balances.qty_on_hand + NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
