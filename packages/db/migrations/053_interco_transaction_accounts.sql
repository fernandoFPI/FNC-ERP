-- ── MIGRATION 053: INTERCO TRANSACTION POSTING ACCOUNTS ────────────────────
-- postIntercoTransaction never let finance choose which discretionary
-- revenue/expense account each side posts to, and had no posted_by column
-- despite the resolver already writing to one (would have errored at runtime
-- on first use). Finance must manually select these accounts before posting,
-- and posting requires approval from both companies (not just one side).

ALTER TABLE interco_transactions
  ADD COLUMN IF NOT EXISTS from_account_id UUID REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS to_account_id UUID REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES users(id);
