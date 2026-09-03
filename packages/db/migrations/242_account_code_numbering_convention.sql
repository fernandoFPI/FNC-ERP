-- Migration 242: Local account-code numbering convention
-- Every ACTIVE local chart_of_accounts.code must be exactly 4 digits (no
-- hyphens, no letters, no variable length) — local codes stay decoupled from
-- group_chart_of_accounts codes (they map via group_account_id, not by
-- matching digits), but should still be internally consistent per company.
-- Scoped to active rows only so the one already-deactivated legacy exception
-- (10082-1, migration 239) doesn't need renumbering or deletion.

-- Verified against fnc_erp_dev before writing this migration: exactly one
-- non-conforming row exists (10082-1, already inactive). Re-check here too,
-- so if this ever runs against a database with different data, it fails with
-- a clear message instead of a bare constraint-violation error.
DO $$
DECLARE
  bad_count INT;
  bad_codes TEXT;
BEGIN
  SELECT count(*), string_agg(code || ' (company ' || company_id || ')', ', ')
    INTO bad_count, bad_codes
    FROM chart_of_accounts
    WHERE is_active AND code !~ '^[0-9]{4}$';
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration 242 aborted: % active account(s) with a non-4-digit code exist: %. Fix or deactivate these first.',
      bad_count, bad_codes;
  END IF;
END $$;

ALTER TABLE chart_of_accounts
  ADD CONSTRAINT chk_code_format CHECK (NOT is_active OR code ~ '^[0-9]{4}$');
