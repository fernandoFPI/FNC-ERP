-- HELD — do not move back into packages/db/migrations/ until the negative
-- balances on production have been reconciled. Run
-- packages/db/scripts/negative_stock_balances.sql on prod first; once
-- everything under "real location (needs reconciling)" is resolved (or
-- explicitly accepted), move this file back into migrations/ with the next
-- free number and it'll apply on the next deploy like any other migration.
--
-- Blocks a stock move from driving qty_on_hand negative at a real physical
-- location (warehouse/site), while still allowing it at a transit/virtual
-- pass-through location — 'transit' plus 'virtual_in'/'virtual_out', which
-- are this schema's actual counter-entry locations (every PO receipt posts
-- from virtual_in, every cross-company transfer's outbound leg posts
-- through virtual_out; 'transit' itself is declared in the type CHECK but
-- not currently used anywhere). Those are meant to run arbitrarily negative
-- — they represent "stock that left the ledger's tracked side, not a real
-- shelf" — so a blanket CHECK (qty_on_hand >= 0) on the table would have
-- broken every receipt on day one. Enforced here in the trigger instead of
-- a table constraint because the exemption needs to look up the location's
-- type, and a CHECK constraint can't reference another table.
--
-- Only the FROM side of a move is guarded — stock_moves.qty is always > 0
-- (existing CHECK), so a fresh move can only newly push a balance negative
-- by decrementing the from_location side; the to_location side only ever
-- adds.
CREATE OR REPLACE FUNCTION update_stock_balance()
RETURNS TRIGGER AS $$
DECLARE
  from_loc_type TEXT;
  resulting_qty NUMERIC(20,4);
BEGIN
  SELECT type INTO from_loc_type FROM stock_locations WHERE id = NEW.from_location_id;

  IF NEW.lot_id IS NULL THEN
    -- No lot: use partial index (NULL-safe)
    INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_move_at, updated_at)
    VALUES (NEW.product_id, NEW.from_location_id, NULL, -NEW.qty, NEW.unit_cost, NEW.moved_at, NOW())
    ON CONFLICT (product_id, location_id) WHERE lot_id IS NULL
    DO UPDATE SET
      qty_on_hand  = stock_balances.qty_on_hand - NEW.qty,
      last_move_at = NEW.moved_at,
      updated_at   = NOW()
    RETURNING qty_on_hand INTO resulting_qty;

    IF resulting_qty < 0 AND (from_loc_type IS NULL OR from_loc_type NOT IN ('transit', 'virtual_in', 'virtual_out')) THEN
      RAISE EXCEPTION 'Stock move would leave % units on hand for product % at location % — not enough stock at this location', resulting_qty, NEW.product_id, NEW.from_location_id;
    END IF;

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
      updated_at   = NOW()
    RETURNING qty_on_hand INTO resulting_qty;

    IF resulting_qty < 0 AND (from_loc_type IS NULL OR from_loc_type NOT IN ('transit', 'virtual_in', 'virtual_out')) THEN
      RAISE EXCEPTION 'Stock move would leave % units on hand for product % (lot %) at location % — not enough stock at this location', resulting_qty, NEW.product_id, NEW.lot_id, NEW.from_location_id;
    END IF;

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
