-- Migration 243: Widen the account-code format to allow a level-5 suffix
-- The proposed FNC chart of accounts (v1.0, 2026-09-02) uses hyphenated
-- level-5 sub-accounts for fine-grained breakdowns (e.g. 3111-01..3111-20
-- for salaries by role, 4112-01..4112-18 for project revenue by trade).
-- Widened from exactly 4 digits to 4 digits with an optional 2-digit
-- hyphenated suffix. This still rejects the original bug pattern this
-- constraint was added to prevent (5-digit bases like 10082-01, 10082-1) —
-- only a 4-digit base qualifies for the suffix.
-- Widening a CHECK can never fail against existing data: everything that
-- satisfied the narrower rule still satisfies this one.

ALTER TABLE chart_of_accounts
  DROP CONSTRAINT chk_code_format;

ALTER TABLE chart_of_accounts
  ADD CONSTRAINT chk_code_format CHECK (NOT is_active OR code ~ '^[0-9]{4}(-[0-9]{2})?$');
