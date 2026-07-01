-- Migration 064: Normalize rental_invoices table
-- Adds columns that the gateway schema references but were never in the original table.

ALTER TABLE rental_invoices
  ADD COLUMN IF NOT EXISTS company_id    UUID          REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS rate_amount   NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount  NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_date  DATE          NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS due_date      DATE          NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days');

-- Backfill company_id from parent contract
UPDATE rental_invoices ri
SET company_id = rc.company_id
FROM rental_contracts rc
WHERE ri.contract_id = rc.id
  AND ri.company_id IS NULL;

-- Backfill total_amount from the original amount column
UPDATE rental_invoices
SET total_amount = amount
WHERE total_amount = 0 AND amount > 0;

-- Backfill rate_amount from parent contract
UPDATE rental_invoices ri
SET rate_amount = rc.rate_amount
FROM rental_contracts rc
WHERE ri.contract_id = rc.id
  AND ri.rate_amount = 0;

-- Backfill invoice_date from created_at
UPDATE rental_invoices
SET invoice_date = created_at::DATE
WHERE invoice_date = CURRENT_DATE AND created_at < NOW() - INTERVAL '1 minute';

-- Backfill due_date = invoice_date + 30
UPDATE rental_invoices
SET due_date = invoice_date + INTERVAL '30 days'
WHERE due_date = invoice_date;
