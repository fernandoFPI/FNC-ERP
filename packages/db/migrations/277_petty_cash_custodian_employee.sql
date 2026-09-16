-- Petty cash floats: replace the free-text custodian_name going forward with
-- a real employee reference (custodian_name stays for legacy display only —
-- never written by the app after this migration). Also adds a proper FK on
-- gl_account_id now that it's required at creation and is the float's one
-- real link to a Chart of Accounts cash account.
ALTER TABLE petty_cash_floats
  ADD COLUMN IF NOT EXISTS custodian_employee_id UUID REFERENCES employees(id);

ALTER TABLE petty_cash_floats
  ADD CONSTRAINT petty_cash_floats_gl_account_id_fkey
    FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id);
