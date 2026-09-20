-- Wires up stock_balances.last_cost_currency (added by migration 258, but
-- explicitly left unpopulated — "Going forward, populating it for real on
-- every insert is Phase 2/3 resolver work, not done here"). The frontend
-- had been hardcoding "IQD" for every row in the meantime, which was
-- already misleading (stock_moves.currency_code, migration 008, has been
-- silently dead the same way) and became actively wrong once a product's
-- unified Cost could be foreign-currency (e.g. a USD-priced import): a
-- Stock Adjustment cost correction entered in that same currency had no
-- way to record what currency the number was actually in.
--
-- Populated the same way average_cost itself already is — "last recorded",
-- carried forward from whichever move most recently set the cost — rather
-- than derived from the product's CURRENT cost_currency, which can change
-- after the fact and would otherwise silently relabel an old,
-- already-correct IQD amount as the product's new currency.
BEGIN;

CREATE OR REPLACE FUNCTION update_stock_balance()
RETURNS TRIGGER AS $$
DECLARE
  from_loc_type TEXT;
  from_loc_name TEXT;
  product_sku TEXT;
  product_name TEXT;
  resulting_qty NUMERIC(20,4);
BEGIN
  SELECT type, name INTO from_loc_type, from_loc_name FROM stock_locations WHERE id = NEW.from_location_id;

  IF NEW.lot_id IS NULL THEN
    -- No lot: use partial index (NULL-safe)
    INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_cost_currency, last_move_at, updated_at)
    VALUES (NEW.product_id, NEW.from_location_id, NULL, -NEW.qty, NEW.unit_cost, NEW.currency_code, NEW.moved_at, NOW())
    ON CONFLICT (product_id, location_id) WHERE lot_id IS NULL
    DO UPDATE SET
      qty_on_hand  = stock_balances.qty_on_hand - NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW()
    RETURNING qty_on_hand INTO resulting_qty;

    IF resulting_qty < 0 AND (from_loc_type IS NULL OR from_loc_type NOT IN ('transit', 'virtual_in', 'virtual_out')) THEN
      SELECT sku, name INTO product_sku, product_name FROM products WHERE id = NEW.product_id;
      RAISE EXCEPTION 'Insufficient stock — % (%) at % would go to % on hand',
        COALESCE(product_sku, NEW.product_id::text), COALESCE(product_name, 'unknown product'),
        COALESCE(from_loc_name, NEW.from_location_id::text), resulting_qty;
    END IF;

    INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_cost_currency, last_move_at, updated_at)
    VALUES (NEW.product_id, NEW.to_location_id, NULL, NEW.qty, NEW.unit_cost, NEW.currency_code, NEW.moved_at, NOW())
    ON CONFLICT (product_id, location_id) WHERE lot_id IS NULL
    DO UPDATE SET
      average_cost = CASE
        WHEN NEW.unit_cost > 0 THEN NEW.unit_cost
        ELSE stock_balances.average_cost
      END,
      last_cost_currency = CASE
        WHEN NEW.unit_cost > 0 THEN NEW.currency_code
        ELSE stock_balances.last_cost_currency
      END,
      qty_on_hand  = stock_balances.qty_on_hand + NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW();
  ELSE
    -- With lot: use original three-column constraint
    INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_cost_currency, last_move_at, updated_at)
    VALUES (NEW.product_id, NEW.from_location_id, NEW.lot_id, -NEW.qty, NEW.unit_cost, NEW.currency_code, NEW.moved_at, NOW())
    ON CONFLICT (product_id, location_id, lot_id)
    DO UPDATE SET
      qty_on_hand  = stock_balances.qty_on_hand - NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW()
    RETURNING qty_on_hand INTO resulting_qty;

    IF resulting_qty < 0 AND (from_loc_type IS NULL OR from_loc_type NOT IN ('transit', 'virtual_in', 'virtual_out')) THEN
      SELECT sku, name INTO product_sku, product_name FROM products WHERE id = NEW.product_id;
      RAISE EXCEPTION 'Insufficient stock — % (%) lot % at % would go to % on hand',
        COALESCE(product_sku, NEW.product_id::text), COALESCE(product_name, 'unknown product'),
        NEW.lot_id, COALESCE(from_loc_name, NEW.from_location_id::text), resulting_qty;
    END IF;

    INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_cost_currency, last_move_at, updated_at)
    VALUES (NEW.product_id, NEW.to_location_id, NEW.lot_id, NEW.qty, NEW.unit_cost, NEW.currency_code, NEW.moved_at, NOW())
    ON CONFLICT (product_id, location_id, lot_id)
    DO UPDATE SET
      average_cost = CASE
        WHEN NEW.unit_cost > 0 THEN NEW.unit_cost
        ELSE stock_balances.average_cost
      END,
      last_cost_currency = CASE
        WHEN NEW.unit_cost > 0 THEN NEW.currency_code
        ELSE stock_balances.last_cost_currency
      END,
      qty_on_hand  = stock_balances.qty_on_hand + NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
