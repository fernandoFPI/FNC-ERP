-- Migration 244: Deactivate the current chart of accounts (fresh cutover)
-- The FNC Chart of Accounts v1.0 draft (2026-09-02) replaces the entire
-- structure built in the September COA-foundation pass. Per the approved
-- plan: no journal history is touched or moved. Every currently-active
-- account is deactivated and its code suffixed -LEGACY, purely to free the
-- numeric code for reuse — chart_of_accounts has UNIQUE(company_id, code)
-- with no active-only qualifier, and the old/new schemes don't correspond
-- code-for-code (old 1100 = "Cash and Bank Accounts", new 1100 =
-- "Non-current Assets"). The suffixed code is exempt from chk_code_format
-- automatically (that constraint only applies WHERE is_active). Metadata
-- only — nothing is deleted, so every existing journal_lines / employee_advances /
-- company_default_cash_accounts / system_configuration reference stays valid.

UPDATE chart_of_accounts
  SET is_active = false, code = code || '-LEGACY', updated_at = NOW()
  WHERE is_active = true;

UPDATE group_chart_of_accounts
  SET is_active = false, code = code || '-LEGACY', updated_at = NOW()
  WHERE is_active = true;

UPDATE cost_centers
  SET is_active = false, code = code || '-LEGACY'
  WHERE is_active = true;
