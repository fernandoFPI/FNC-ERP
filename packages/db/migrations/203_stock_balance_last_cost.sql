-- Switch stock_balances.average_cost from a weighted-average (AVCO) costing
-- method to "last recorded cost": each inbound stock move now overwrites the
-- cost outright with its own unit_cost, instead of blending it into the
-- running average. A move with no unit_cost (0/NULL) is ignored so it can't
-- wipe out the last real price. Existing balances are intentionally left
-- as-is (not backfilled) and will pick up the new value on their next move.
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
        WHEN NEW.unit_cost > 0 THEN NEW.unit_cost
        ELSE stock_balances.average_cost
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
        WHEN NEW.unit_cost > 0 THEN NEW.unit_cost
        ELSE stock_balances.average_cost
      END,
      qty_on_hand  = stock_balances.qty_on_hand + NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
