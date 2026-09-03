-- Migration 241: FK enforcement on previously-loose gl_account_id-style columns
-- Verified against live data first (all zero orphans): petty_cash_floats and
-- recon_bank_accounts are empty, employee_advances/advance_settlement_lines/
-- advance_returns already have valid references — this is metadata-only, no
-- data changes needed.

ALTER TABLE petty_cash_floats
  ADD CONSTRAINT fk_petty_cash_floats_gl_account
    FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id);

ALTER TABLE recon_bank_accounts
  ADD CONSTRAINT fk_recon_bank_accounts_gl_account
    FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id);

ALTER TABLE employee_advances
  ADD CONSTRAINT fk_employee_advances_cash_account
    FOREIGN KEY (cash_account_id) REFERENCES chart_of_accounts(id),
  ADD CONSTRAINT fk_employee_advances_advance_account
    FOREIGN KEY (advance_account_id) REFERENCES chart_of_accounts(id);

ALTER TABLE advance_settlement_lines
  ADD CONSTRAINT fk_advance_settlement_lines_gl_account
    FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id);

ALTER TABLE advance_returns
  ADD CONSTRAINT fk_advance_returns_cash_account
    FOREIGN KEY (cash_account_id) REFERENCES chart_of_accounts(id);
