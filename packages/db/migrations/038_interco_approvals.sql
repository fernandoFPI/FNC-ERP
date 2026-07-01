-- Add dual-company approval tracking to interco_transactions
ALTER TABLE interco_transactions
  ADD COLUMN IF NOT EXISTS from_company_approved_by  UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS from_company_approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS to_company_approved_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS to_company_approved_at    TIMESTAMPTZ;
