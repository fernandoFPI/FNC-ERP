-- D10: purchase_orders.subtotal/total_amount can no longer be computed as a
-- single converted figure (fx_rate_to_base conversion removed from
-- recalcPOTotalsGW and its callers -- see services/gateway resolvers.ts).
-- A PO whose lines span more than one currency_code has no single correct
-- value to put in these columns under the no-currency-exchange policy, so
-- the write path now sends NULL for that case instead of a blended sum.
-- tax_amount is untouched -- it isn't part of this write path.
ALTER TABLE purchase_orders ALTER COLUMN subtotal DROP NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN total_amount DROP NOT NULL;
