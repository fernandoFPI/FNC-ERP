-- Simplify the phone recharge workflow: drop the approval step entirely
-- (pending -> fulfilled -> confirmed, plus cancelled) and move from a
-- per-request cost-center pick to one company-wide default.

-- 1. Reassign any existing rows in the statuses being removed before
--    tightening the constraint. 'approved' rows were mid-flow and are now
--    equivalent to 'pending' (ready to fulfill, nothing left to approve).
--    'rejected' rows are terminal-negative, same as 'cancelled'.
UPDATE recharge_requests SET status = 'pending' WHERE status = 'approved';
UPDATE recharge_requests SET status = 'cancelled' WHERE status = 'rejected';

ALTER TABLE recharge_requests DROP CONSTRAINT IF EXISTS recharge_requests_status_check;
ALTER TABLE recharge_requests
  ADD CONSTRAINT recharge_requests_status_check
  CHECK (status IN ('pending','fulfilled','confirmed','cancelled'));

-- approved_by/approved_at/rejection_reason are no longer written by any
-- resolver once the approval step is gone, but are left in place rather
-- than dropped — they're historical record for any requests that already
-- went through the old flow, and dropping columns is riskier than just
-- leaving unused ones nullable.

-- 2. One company-wide recharge cost center instead of a per-request pick.
ALTER TABLE system_configuration
  ADD COLUMN IF NOT EXISTS recharge_cost_center_id UUID REFERENCES cost_centers(id);
