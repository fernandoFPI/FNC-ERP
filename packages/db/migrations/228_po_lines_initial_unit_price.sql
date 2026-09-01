-- Tracks the unit price a requester originally typed when creating a PO
-- line, separately from unit_price -- which submitPOMarketPricing
-- (services/gateway/src/graphql/resolvers.ts) later overwrites with the
-- real vendor-quoted price (SET unit_price=$1, market_price=$1 ... to the
-- SAME new value). There was previously no column preserving that original
-- value once market pricing ran.
ALTER TABLE po_lines ADD COLUMN IF NOT EXISTS initial_unit_price NUMERIC(20,4);

-- Backfill only where it can be done accurately: a line that has never
-- gone through market pricing (market_price IS NULL) still has its true,
-- untouched original value sitting in unit_price right now. A line that's
-- already been through market pricing has already lost it -- there is no
-- record anywhere of what it originally was, so it's deliberately left
-- NULL (shown as unknown) rather than backfilled with today's value, which
-- would look correct without being correct.
UPDATE po_lines SET initial_unit_price = unit_price WHERE market_price IS NULL;
