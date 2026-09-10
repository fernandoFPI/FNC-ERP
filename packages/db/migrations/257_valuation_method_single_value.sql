-- Finishes what migration 217 started. 217 backfilled every row to
-- 'last_cost' and made it the default, but kept 'avco'/'fifo'/'standard'
-- in the CHECK constraint as a compatibility shim for write paths that
-- might still use them — and two did: services/gateway's legacy inventory
-- importer and the one-off scripts/import-inventory.js script both still
-- hardcoded 'avco' on every new product, silently reintroducing the exact
-- mislabeling 217 was meant to eliminate for any product created via
-- import since. Both are fixed in this same change (now write 'last_cost'
-- directly), so this is safe to close for good: no live code path writes
-- anything but 'last_cost' anymore. The column itself stays — it's still
-- a real, referenced field — this only removes the other three values as
-- valid inputs.
--
-- update_stock_balance() (migration 203) already computes cost as "last
-- recorded cost" unconditionally and doesn't read this column at all, so
-- this is a labeling correctness fix, not a costing behavior change.
UPDATE products SET valuation_method = 'last_cost' WHERE valuation_method != 'last_cost';

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_valuation_method_check;
ALTER TABLE products
  ADD CONSTRAINT products_valuation_method_check
  CHECK (valuation_method = 'last_cost');
