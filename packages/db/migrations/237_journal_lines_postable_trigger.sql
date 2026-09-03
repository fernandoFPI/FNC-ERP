-- Migration 237: Enforce postable-only journal postings
-- No central journal-posting helper exists in the codebase (~55 raw
-- INSERT INTO journal_lines call sites across services/finance, services/worker,
-- and services/gateway/src/graphql/resolvers.ts), so this rule is enforced at
-- the DB level via trigger rather than trusted to application code.

CREATE OR REPLACE FUNCTION fn_enforce_postable_account() RETURNS TRIGGER AS $$
BEGIN
  IF NOT (SELECT is_postable FROM chart_of_accounts WHERE id = NEW.account_id) THEN
    RAISE EXCEPTION 'Account % is not postable (header or non-postable account)', NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_lines_postable
  BEFORE INSERT OR UPDATE OF account_id ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_postable_account();
