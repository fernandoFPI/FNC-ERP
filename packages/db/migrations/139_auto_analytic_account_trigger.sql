-- Migration 139: Auto-create analytic account for every new project
-- Fires after INSERT so it covers all code paths (mutations, imports, seeds, etc.)

CREATE OR REPLACE FUNCTION trg_ensure_project_analytic_account()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_aa_id UUID;
  v_code  VARCHAR(20);
BEGIN
  IF NEW.analytic_account_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_code := LEFT(NEW.code, 20);

  INSERT INTO analytic_accounts (company_id, name, code, is_active)
  VALUES (NEW.company_id, 'Project: ' || NEW.name, v_code, true)
  ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_aa_id;

  UPDATE projects SET analytic_account_id = v_aa_id WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_analytic_account ON projects;
CREATE TRIGGER trg_project_analytic_account
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION trg_ensure_project_analytic_account();
