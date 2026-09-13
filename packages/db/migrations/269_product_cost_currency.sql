-- Lets a product record its cost's real currency, independent of the
-- company's default currency. Nullable/no default on purpose — NULL means
-- "not yet specified," distinct from a deliberate 'IQD'. Used as the
-- second-level fallback (after the product's own cached last-market-price
-- currency, before the company/PO base-currency guess) by
-- confirmPOInventoryCheck and confirmRequisitionInventoryCheck's Store
-- Pricing auto-fill, for a product that's never been through Market
-- Pricing yet.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_currency CHAR(3);
