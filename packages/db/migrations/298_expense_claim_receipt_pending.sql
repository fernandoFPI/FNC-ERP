-- Lets the organizer declare, at submission, that the expense hasn't been
-- paid yet — approval is needed first, and the receipt will be attached
-- afterward. Enforced at pass-audit: a claim marked receipt_pending can't
-- pass audit until something is actually attached (see services/finance/
-- src/routes/expense-claims.ts).
ALTER TABLE expense_claims ADD COLUMN receipt_pending BOOLEAN NOT NULL DEFAULT false;
