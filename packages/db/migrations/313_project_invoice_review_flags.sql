-- An invoice in review can be rejected, with the lines that need changing flagged and a reason,
-- and goes back to draft for the person who made it to fix and resubmit (same flow as expense
-- claims, migration 312, and requisitions, migration 279).
--
-- Why: an invoice in 'review' had one button, Approve. An approver who saw something wrong had
-- to tell the creator outside the system. Nothing here needs a new status: a draft already has
-- Edit, Submit for review and Void.
--
-- Flag columns on the lines mirror migration 312 / 279:
--   flagged_at / flag_reason / flagged_by   set together when an approver rejects with the line ticked
--   flag_addressed_at                       stamped when the invoice is submitted for review again
--   flag_resolved_at / flag_resolved_by     the approver confirms the fix; only this clears the highlight
-- The invoice keeps the last rejection (who, when, why) as history, so a draft that was sent back
-- shows the reason, and after a resubmit it reads as "previously rejected".

ALTER TABLE project_invoice_lines
  ADD COLUMN flag_reason TEXT,
  ADD COLUMN flagged_at TIMESTAMPTZ,
  ADD COLUMN flagged_by UUID REFERENCES users(id),
  ADD COLUMN flag_addressed_at TIMESTAMPTZ,
  ADD COLUMN flag_resolved_at TIMESTAMPTZ,
  ADD COLUMN flag_resolved_by UUID REFERENCES users(id);

CREATE INDEX idx_project_invoice_lines_open_flags ON project_invoice_lines (invoice_id)
  WHERE flagged_at IS NOT NULL AND flag_resolved_at IS NULL;

ALTER TABLE project_invoices
  ADD COLUMN rejected_by UUID REFERENCES users(id),
  ADD COLUMN rejected_at TIMESTAMPTZ,
  ADD COLUMN rejection_reason TEXT;
