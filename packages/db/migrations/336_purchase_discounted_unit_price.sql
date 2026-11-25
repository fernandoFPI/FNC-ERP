BEGIN;

-- A vendor sometimes gives a discount on an item. The buyer records the unit price AFTER the discount next to the price the
-- vendor quoted. When it is filled it is the price that counts everywhere (the purchase total, the child purchase order, the
-- tolerance check, product cost); the quoted price (actual_unit_price) then stays on the purchase as information only.
-- NULL means no discount: every purchase made before this column behaves exactly as it did.
ALTER TABLE po_line_purchases
  ADD COLUMN IF NOT EXISTS discounted_unit_price NUMERIC(20,4);

ALTER TABLE po_line_purchases
  DROP CONSTRAINT IF EXISTS po_line_purchases_discounted_price_check;
ALTER TABLE po_line_purchases
  ADD CONSTRAINT po_line_purchases_discounted_price_check
  CHECK (
    discounted_unit_price IS NULL
    OR (discounted_unit_price > 0 AND discounted_unit_price <= actual_unit_price)
  );

COMMIT;
