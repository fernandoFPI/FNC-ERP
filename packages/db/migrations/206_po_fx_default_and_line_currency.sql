-- Migration 204: default PO exchange rate + suggested per-line currency at creation
--
-- Two additive pieces, neither disturbs the existing market-pricing-owned
-- currency math (po_lines.currency_code / fx_rate_to_base, set only by
-- submitPOMarketPricing — see resolvers.ts and migration 202's comment):
--
-- 1. po_fx_rates.is_default: lets Settings mark one configured currency as
--    the starting currency for new POs (distinct from
--    system_configuration.default_po_currency, which is the BASE currency
--    everything converts to — this is "what currency do we usually buy in").
--
-- 2. po_lines.requested_currency_code: the currency picked per line at PO
--    creation time, before a vendor is chosen. Purely a suggestion the buyer
--    records — market pricing pre-fills its own currency picker from this
--    instead of defaulting blind, but still has final say once a real quote
--    exists. Never read by recalcPO or any total/journal math.

ALTER TABLE po_fx_rates
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- At most one default per company.
CREATE UNIQUE INDEX IF NOT EXISTS po_fx_rates_one_default_per_company
  ON po_fx_rates (company_id) WHERE is_default = true;

ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS requested_currency_code CHAR(3);
