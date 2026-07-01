-- Migration 083: Fix sync_project_cost_actuals trigger to match partial unique index
-- Migration 071 replaced the UNIQUE constraint on project_cost_actuals.journal_line_id
-- with a partial unique index (WHERE journal_line_id IS NOT NULL).
-- ON CONFLICT (col) only works against a full unique constraint; to target a partial
-- unique index the WHERE clause must be repeated in the ON CONFLICT clause.

CREATE OR REPLACE FUNCTION sync_project_cost_actuals()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id UUID;
  v_entry_date DATE;
  v_source_type VARCHAR(50);
BEGIN
  IF NEW.analytic_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_project_id
  FROM analytic_accounts aa
  JOIN projects p ON p.analytic_account_id = aa.id
  WHERE aa.id = NEW.analytic_account_id;

  IF v_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT entry_date, source_type INTO v_entry_date, v_source_type
  FROM journal_entries WHERE id = NEW.journal_entry_id;

  INSERT INTO project_cost_actuals
    (project_id, journal_line_id, amount, currency_code, entry_date, source_type)
  VALUES
    (v_project_id, NEW.id,
     NEW.debit - NEW.credit,
     NEW.currency_code, v_entry_date, v_source_type)
  ON CONFLICT (journal_line_id) WHERE journal_line_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
