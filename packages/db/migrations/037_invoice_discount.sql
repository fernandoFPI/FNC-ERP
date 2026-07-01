-- Add discount columns to project_invoices
ALTER TABLE project_invoices
  ADD COLUMN IF NOT EXISTS discount_pct    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(20,4) NOT NULL DEFAULT 0;
