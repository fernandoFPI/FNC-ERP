-- Migration 202: PO exchange rates + base currency snapshot
--
-- Context: PO lines can legitimately be priced in different currencies (different
-- vendors quote differently), but purchase_orders.currency_code / po_lines' several
-- currency columns were never reconciled against each other or the header total —
-- recalcPO summed po_lines.total_price regardless of currency. This adds a real,
-- always-correct conversion path.
--
-- Deliberately NOT reusing fx_rates/fx_rate_sync_log (006/027) — those are
-- date-scored, automated-sync rates built for finance journal revaluation.
-- Procurement wants one settings-controlled rate per currency that applies to
-- every PO until someone updates it in Settings — simpler and more predictable
-- for this use case than a historical per-date lookup.

CREATE TABLE po_fx_rates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  currency_code CHAR(3) NOT NULL,
  rate_to_base  NUMERIC(20,6) NOT NULL CHECK (rate_to_base > 0),
    -- Multiply an amount in currency_code by this to get an amount in the
    -- company's base currency (system_configuration.default_po_currency).
  updated_by    UUID REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, currency_code)
);

CREATE INDEX idx_po_fx_rates_company ON po_fx_rates(company_id);

-- purchase_orders.base_currency_code: snapshotted at PO creation from
-- system_configuration.default_po_currency, rather than joined live, so a
-- later change to the company's default PO currency doesn't retroactively
-- reinterpret what an existing PO's total_amount is denominated in.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS base_currency_code CHAR(3);

-- Backfill: best available signal for historical rows is the PO's own header
-- currency_code — there's no way to know retroactively what the company's
-- default currency was at each PO's creation time.
UPDATE purchase_orders SET base_currency_code = currency_code WHERE base_currency_code IS NULL;

ALTER TABLE purchase_orders
  ALTER COLUMN base_currency_code SET NOT NULL,
  ALTER COLUMN base_currency_code SET DEFAULT 'IQD';

-- po_lines.fx_rate_to_base: set when a line is actually priced (submitPOMarketPricing
-- — see resolvers.ts), where the real vendor-quoted currency first becomes known.
-- NULL until then; recalcPO treats NULL as 1 (already-in-base-currency), so the
-- overwhelmingly common same-currency case needs zero configuration.
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS fx_rate_to_base NUMERIC(20,6);

-- Backfill: po_lines.currency_code has been dead in the live resolver path since
-- creation (createPurchaseOrder's line insert never set it, so it silently took
-- the schema default 'IQD') — every historical line was, in effect, treated as
-- base-currency already. Preserve that behavior explicitly rather than leaving
-- it to COALESCE's runtime default, so a report can distinguish "never priced
-- cross-currency" (rate = 1, stamped here) from "priced after this migration".
UPDATE po_lines SET fx_rate_to_base = 1 WHERE fx_rate_to_base IS NULL;
