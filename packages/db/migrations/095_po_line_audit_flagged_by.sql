-- Migration 095: track who set the audit flag on a po_line
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS audit_flagged_by_email TEXT,
  ADD COLUMN IF NOT EXISTS audit_flagged_at       TIMESTAMPTZ;
