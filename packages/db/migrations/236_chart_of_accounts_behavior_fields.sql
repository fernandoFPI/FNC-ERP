-- Migration 236: Account behavior fields on chart_of_accounts
-- Adds the group-account link and header/postable/control/category metadata.
-- All new columns default to "normal postable leaf" so existing rows are unaffected.

ALTER TABLE chart_of_accounts
  ADD COLUMN group_account_id   UUID REFERENCES group_chart_of_accounts(id),
  ADD COLUMN is_header          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_postable        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN is_control_account BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN account_category   VARCHAR(20)
    CHECK (account_category IN (
      'CASH','BANK','RECEIVABLE','PAYABLE','INTERCOMPANY','INVENTORY',
      'WIP','PREPAID','FIXED_ASSET','TAX','EQUITY','REVENUE','COGS','OPEX','OTHER'
    ));

ALTER TABLE chart_of_accounts
  ADD CONSTRAINT chk_header_not_postable CHECK (NOT is_header OR NOT is_postable);

CREATE INDEX idx_coa_group_account ON chart_of_accounts(group_account_id);
