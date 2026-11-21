BEGIN;

-- Stale stock cost flag (playbook #111): a product's Cost (products.standard_cost) is what gets copied onto a requisition
-- line as its store price when the line is covered from stock. If that Cost has not changed for more than 30 days the
-- store keeper is asked to double-check it. A Cost that is genuinely stable (most are: 94 % of the stocked catalogue
-- had not changed in 30 days when this was designed) needs a way to say "I checked, it is right" without editing it, or
-- the same item would be flagged on every requisition for ever. That check is recorded here.
--
-- The age of a Cost is the newest of: the last real change (product_cost_history.changed_at), the last time somebody
-- confirmed it (cost_confirmed_at), and, for a product with neither, the day it was created.
-- Both columns are nullable and additive: nothing existing reads or writes them, and NULL means "never confirmed".
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cost_confirmed_by UUID REFERENCES users(id);

COMMIT;
