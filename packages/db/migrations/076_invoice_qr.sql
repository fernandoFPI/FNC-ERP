-- Add verification token for QR-based invoice authenticity checking.
-- PostgreSQL fills gen_random_uuid() for all existing rows at ALTER time.
ALTER TABLE project_invoices
  ADD COLUMN IF NOT EXISTS verification_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_invoices_verification_token
  ON project_invoices(verification_token);
