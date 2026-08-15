-- Phase 2 of the Employee Cash Advance module: void (reversal) audit trail.
-- A separate trio of columns, matching the existing submitted_at/approved_by+approved_at/
-- rejected_by+rejected_at+rejection_reason pattern already on employee_advances — each
-- status transition gets its own dedicated audit columns rather than reusing another
-- transition's columns for a different meaning.
ALTER TABLE employee_advances
  ADD COLUMN voided_by UUID,
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN void_reason TEXT;
