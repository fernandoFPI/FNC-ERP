-- Migration 296: Expense claim audit stage
-- ─────────────────────────────────────────────────────────────────────────
-- Inserts a Finance-audit decision between 'approved' and 'posted': Pass
-- moves the claim to 'audited' (what now gates Post Payment, previously
-- triggered straight from 'approved'); Fail sends it back to 'draft' so the
-- employee/admin can correct it via the existing PUT /expense-claims/:id
-- (already restricted to draft claims) and resubmit through the normal
-- draft -> submitted -> approved -> audited path.
ALTER TABLE expense_claims DROP CONSTRAINT expense_claims_status_check;
ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_status_check
  CHECK (status IN ('draft','submitted','approved','audited','rejected','posted','paid'));

ALTER TABLE expense_claims
  ADD COLUMN audited_by UUID,
  ADD COLUMN audited_at TIMESTAMPTZ,
  ADD COLUMN audit_fail_reason TEXT;
