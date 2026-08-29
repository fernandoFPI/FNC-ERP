-- products.valuation_method has claimed 'avco'/'fifo'/'standard' since day
-- one, but migration 203 replaced the actual costing trigger with "last
-- recorded cost" for every product, unconditionally — nothing has computed
-- a real weighted average, FIFO, or standard cost since. Every existing row
-- is equally mislabeled, not just new ones, so this backfills all of them
-- to the value that's actually true, and makes it the honest default going
-- forward. Old values kept in the CHECK constraint (not dropped) purely so
-- historical audit trails referencing them still validate — the app itself
-- only ever writes 'last_cost' now.
ALTER TABLE products ALTER COLUMN valuation_method SET DEFAULT 'last_cost';
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_valuation_method_check;
ALTER TABLE products
  ADD CONSTRAINT products_valuation_method_check
  CHECK (valuation_method IN ('last_cost','avco','fifo','standard'));

UPDATE products SET valuation_method = 'last_cost' WHERE valuation_method != 'last_cost';
