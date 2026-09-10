-- Post-deploy sanity check for migration 254 (the negative-balance trigger
-- guard): confirms a normal Store In (receipt) and a normal Store Out
-- both still succeed once it's live. Wrapped in BEGIN/ROLLBACK — nothing
-- persists, safe to run on prod.
--
-- Picks a real product/location with healthy positive stock, does a small
-- receipt (virtual_in -> warehouse) and a small issue (warehouse ->
-- virtual_out) against it, prints the resulting balances, then rolls back.
-- If either INSERT throws, the trigger is incorrectly blocking a normal
-- operation — investigate before trusting 254 in production.
--
-- Usage: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/verify_trigger_normal_ops.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_product_id UUID;
  v_location_id UUID;
  v_company_id UUID;
  v_virtual_in UUID;
  v_virtual_out UUID;
  v_before NUMERIC;
BEGIN
  -- Any product/location with a comfortable positive balance.
  SELECT sb.product_id, sb.location_id, sl.company_id, sb.qty_on_hand
    INTO v_product_id, v_location_id, v_company_id, v_before
  FROM stock_balances sb
  JOIN stock_locations sl ON sl.id = sb.location_id
  WHERE sb.qty_on_hand > 10 AND sl.type = 'warehouse' AND sl.is_active = true
  ORDER BY sb.qty_on_hand DESC
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'No product/location with qty_on_hand > 10 found to test against';
  END IF;

  SELECT id INTO v_virtual_in FROM stock_locations WHERE company_id = v_company_id AND type = 'virtual_in' AND is_active = true LIMIT 1;
  SELECT id INTO v_virtual_out FROM stock_locations WHERE company_id = v_company_id AND type = 'virtual_out' AND is_active = true LIMIT 1;

  RAISE NOTICE 'Testing against product % at location % (currently % on hand)', v_product_id, v_location_id, v_before;

  -- Store In: receipt, virtual_in -> warehouse. Should always succeed.
  INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, notes, moved_by)
  VALUES (v_company_id, v_product_id, v_virtual_in, v_location_id, NOW(), 1, 1, 1, 'manual', 'Trigger sanity check — Store In, rolled back', NULL);
  RAISE NOTICE 'Store In (receipt) succeeded.';

  -- Store Out: issue, warehouse -> virtual_out. Well within available stock.
  INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, notes, moved_by)
  VALUES (v_company_id, v_product_id, v_location_id, v_virtual_out, NOW(), 1, 1, 1, 'manual', 'Trigger sanity check — Store Out, rolled back', NULL);
  RAISE NOTICE 'Store Out (issue) succeeded.';
END $$;

SELECT 'PASS — both a normal Store In and Store Out succeeded with the trigger live.' AS result;

ROLLBACK;
