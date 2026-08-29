-- Phone recharge requests were fully tracked operationally (request, fulfill
-- with proof photo, confirm) but never posted an actual expense to the GL —
-- recharge_bundles.amount is real money with nowhere to land in the books.
-- Mirrors the petty-cash pattern: an admin configures which two accounts to
-- use once, and fulfillment posts automatically only when both are set
-- (skipped gracefully otherwise, same as petty cash's optional gl_account_id).
ALTER TABLE system_configuration
  ADD COLUMN IF NOT EXISTS recharge_expense_account_id UUID REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS recharge_funding_account_id UUID REFERENCES chart_of_accounts(id);
