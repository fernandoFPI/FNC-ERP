-- Caches the last real vendor-quoted price for a product, captured whenever
-- a PO line is priced at Market Pricing (the one place a real quote is ever
-- known — see submitPOMarketPricing). Store Pricing (valuing the
-- from-stock portion of a PO) is now auto-filled from this cache instead of
-- requiring a human to type a number in every time — see
-- confirmPOInventoryCheck's auto-advance past 'store_pricing'.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS last_market_price NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS last_market_price_currency CHAR(3),
  ADD COLUMN IF NOT EXISTS last_market_price_at TIMESTAMPTZ;
