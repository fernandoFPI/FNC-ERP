-- Migration 319: a Financing phase between Execution and Closeout.
--
-- Execution ends, the finance team issues the project's invoices and watches them
-- get paid, and only then does the project close out. Phases are company config
-- (migration 166), so this adds one row per company and moves Closeout up by one.
--
-- Nothing else changes:
--   * projects.lifecycle_phase is a plain VARCHAR(30) with no CHECK (migration 140),
--     so 'financing' needs no schema change there.
--   * projects.status stays 'approved' while a project is in Financing, so every
--     existing check on an approved project (POs, costs, invoicing) is untouched.
--   * No project is moved. Projects in Execution stay in Execution until someone
--     presses End Execution; projects already in Closeout stay there.
--   * No tab gate uses 'closeout' as its minimum phase (166 / 175), so reordering
--     cannot hide or reveal a tab.
--
-- Idempotent: the INSERT skips a company that already has the row, and the UPDATE
-- only moves Closeout while Financing is not already before it. A company that
-- renamed its phases keeps its labels (only the new row gets the default label).

INSERT INTO lifecycle_phases (company_id, key, label, sequence, optional)
SELECT c.company_id, 'financing', 'Financing', c.sequence, false
FROM lifecycle_phases c
WHERE c.key = 'closeout'
  AND NOT EXISTS (
    SELECT 1 FROM lifecycle_phases f
    WHERE f.company_id = c.company_id AND f.key = 'financing'
  );

UPDATE lifecycle_phases c
SET sequence = c.sequence + 1,
    updated_at = NOW()
FROM lifecycle_phases f
WHERE c.key = 'closeout'
  AND f.company_id = c.company_id
  AND f.key = 'financing'
  AND f.sequence >= c.sequence;
