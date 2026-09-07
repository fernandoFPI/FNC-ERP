-- Migration 245: Allow a 'memo' account_type for off-balance-sheet accounts
-- The FNC Chart of Accounts v1.0 draft includes a control/memorandum series
-- (bank guarantees issued, letters of credit open, guarantees received,
-- third-party assets in custody) — standard for an EPC contractor, but not
-- part of the balance sheet or P&L. Every report query (trial balance, P&L,
-- balance sheet in services/gateway/src/graphql/resolvers.ts) explicitly
-- filters account_type IN ('asset','liability',...) rather than pulling all
-- accounts, so adding an unlisted 'memo' type excludes these automatically
-- from every financial report with no changes to the reporting queries
-- themselves. Widening a CHECK can't fail against existing data.

ALTER TABLE chart_of_accounts
  DROP CONSTRAINT chart_of_accounts_account_type_check;
ALTER TABLE chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_account_type_check
    CHECK (account_type IN ('asset','liability','equity','revenue','expense','memo'));

ALTER TABLE group_chart_of_accounts
  DROP CONSTRAINT group_chart_of_accounts_account_type_check;
ALTER TABLE group_chart_of_accounts
  ADD CONSTRAINT group_chart_of_accounts_account_type_check
    CHECK (account_type IN ('asset','liability','equity','revenue','expense','memo'));
