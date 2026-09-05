-- Migration 243: Track who marked an expense claim as paid
-- expense_claims already tracks approved_by/approved_at and rejected_by/
-- rejected_at, but mark-paid never recorded an actor at all.

ALTER TABLE expense_claims ADD COLUMN paid_by UUID;
ALTER TABLE expense_claims ADD COLUMN paid_at TIMESTAMPTZ;
