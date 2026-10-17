-- Migration 303 (G1/G2): posting-account resolver backing table.
-- Replaces every "guess a GL account by code prefix/exact code/name"
-- producer (outbox-processor.ts, interco-stock-transfer.ts, resolvers.ts —
-- see docs/finance/account-lookups.md) with an explicit, per-company,
-- optionally per-currency map. Seeded with nothing — D1 (which account
-- fills which role, per company) is the user's call, not a guess.

CREATE TABLE company_posting_accounts (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role          VARCHAR(30) NOT NULL CHECK (role IN (
    'ar','ap','revenue_project','revenue_rental','expense_default','cash',
    'retention_receivable','retention_payable',
    'wht_recoverable','wht_payable','wht_expense',
    'salaries_payable','payroll_tax_payable',
    'grni','stock_variance',
    'interco_receivable','interco_payable',
    'inventory'
  )),
  -- NULL = this role's default account regardless of currency. A non-null
  -- row is a currency-specific override, preferred over the default when
  -- both exist for the same role (see resolvePostingAccount).
  currency_code CHAR(3),
  account_id    UUID        NOT NULL REFERENCES chart_of_accounts(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES users(id),
  updated_by    UUID REFERENCES users(id)
);

-- At most one default (NULL-currency) row and one row per currency, per
-- company+role. A plain UNIQUE constraint would let multiple NULL-currency
-- rows coexist (NULL <> NULL), so the default case needs its own partial
-- index.
CREATE UNIQUE INDEX uq_company_posting_accounts_currency
  ON company_posting_accounts(company_id, role, currency_code)
  WHERE currency_code IS NOT NULL;
CREATE UNIQUE INDEX uq_company_posting_accounts_default
  ON company_posting_accounts(company_id, role)
  WHERE currency_code IS NULL;

CREATE INDEX idx_company_posting_accounts_lookup
  ON company_posting_accounts(company_id, role);

-- Enforced at the DB layer (not just in the settings mutation) so nothing
-- can wire a role to an account from a different company, an inactive
-- account, or a header account — the same guarantee migration 237 already
-- gives journal_lines, applied here one step earlier in the chain.
CREATE OR REPLACE FUNCTION validate_company_posting_account()
RETURNS TRIGGER AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  SELECT (a.company_id = NEW.company_id AND a.is_active AND a.is_postable) INTO v_ok
  FROM chart_of_accounts a WHERE a.id = NEW.account_id;

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'posting account must belong to this company, be active, and be a postable (leaf) account';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_company_posting_account
  BEFORE INSERT OR UPDATE ON company_posting_accounts
  FOR EACH ROW EXECUTE FUNCTION validate_company_posting_account();
