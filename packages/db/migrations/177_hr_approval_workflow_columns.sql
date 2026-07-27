-- 177_hr_approval_workflow_columns
-- services/gateway/src/routes/mobile-sync.ts's processOTAction/processLeaveAction
-- have written to these columns since they were added, but overtime_logs never
-- got the approval-workflow columns it needs (unlike leave_requests, which has
-- everything except review_notes) — mobile overtime/leave approve-reject actions
-- have been crashing on every call.

ALTER TABLE overtime_logs
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS review_notes TEXT;
