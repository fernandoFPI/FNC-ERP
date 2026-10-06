-- Migration 292: Expense claim funding source decided by Finance, not the employee
-- ─────────────────────────────────────────────────────────────────────────────
-- The employee's self-service expense request no longer picks "Paid: reimburse
-- me / from my advance / from petty cash" — it just submits lines + receipts.
-- Finance makes that call later, after approving the claim's legitimacy, via a
-- new Post Payment step. funding_source/petty_cash_float_id record what they
-- chose; settled_via_settlement_id links a claim Finance routed to an advance
-- settlement instead of reimbursing it directly (the real advance_settlements
-- row is what actually clears the employee_advances balance — this is just
-- the cross-reference back from the originating claim).

ALTER TABLE expense_claims
  ADD COLUMN funding_source VARCHAR(20)
    CHECK (funding_source IN ('reimburse', 'advance', 'petty_cash')),
  ADD COLUMN petty_cash_float_id UUID REFERENCES petty_cash_floats(id),
  ADD COLUMN settled_via_settlement_id UUID REFERENCES advance_settlements(id);
