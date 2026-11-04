-- Expense claim lines get a stable number ("#") and per-line review flags.
--
-- Why: an approver who rejects one line of a 19-line claim (EXP-2026-0043, "Line 10 has an
-- incorrect price; please revise") had to count rows by hand and type the number into the
-- reason, because lines had no number and no stable order (they sorted by expense_date and a
-- random uuid). Requisitions already have this (po_lines.line_number, and the flag columns of
-- migration 279); this brings expense claim lines to the same shape.
--
-- line_number: 1..n in the order the claim was entered. Existing lines are numbered in the
-- order everyone sees today (expense_date, id), so "Line 10" in an old message still means the
-- row it meant. A number is never reused or shifted inside a claim: expense_claims.line_counter
-- hands out the next one, and a removed line's number is retired with it.
--
-- The trigger fills line_number when an insert leaves it NULL, so no insert path (the three in
-- finance's expense-claims.ts, tests, seeds, a hand-run INSERT) can forget it. The UPDATE on the
-- parent row also serialises two inserts into the same claim.
--
-- Flag columns mirror migration 279 (flag_reason / flagged_* / flag_addressed_at /
-- flag_resolved_*), minus flagged_from_status: a claim has one review stage, not two.

ALTER TABLE expense_claims
  ADD COLUMN line_counter INTEGER NOT NULL DEFAULT 0;

ALTER TABLE expense_claim_lines
  ADD COLUMN line_number INTEGER,
  ADD COLUMN flag_reason TEXT,
  ADD COLUMN flagged_at TIMESTAMPTZ,
  ADD COLUMN flagged_by UUID REFERENCES users(id),
  ADD COLUMN flag_addressed_at TIMESTAMPTZ,
  ADD COLUMN flag_resolved_at TIMESTAMPTZ,
  ADD COLUMN flag_resolved_by UUID REFERENCES users(id);

UPDATE expense_claim_lines l
SET line_number = n.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY claim_id ORDER BY expense_date, id) AS rn
  FROM expense_claim_lines
) n
WHERE n.id = l.id;

UPDATE expense_claims ec
SET line_counter = m.max_n
FROM (
  SELECT claim_id, MAX(line_number) AS max_n FROM expense_claim_lines GROUP BY claim_id
) m
WHERE m.claim_id = ec.id;

ALTER TABLE expense_claim_lines ALTER COLUMN line_number SET NOT NULL;

CREATE UNIQUE INDEX uq_exp_lines_claim_number ON expense_claim_lines (claim_id, line_number);

CREATE INDEX idx_exp_lines_open_flags ON expense_claim_lines (claim_id)
  WHERE flagged_at IS NOT NULL AND flag_resolved_at IS NULL;

CREATE OR REPLACE FUNCTION assign_expense_claim_line_number() RETURNS trigger AS $$
BEGIN
  IF NEW.line_number IS NULL THEN
    UPDATE expense_claims SET line_counter = line_counter + 1
    WHERE id = NEW.claim_id
    RETURNING line_counter INTO NEW.line_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expense_claim_line_number
  BEFORE INSERT ON expense_claim_lines
  FOR EACH ROW EXECUTE FUNCTION assign_expense_claim_line_number();
