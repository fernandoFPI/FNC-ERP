-- Migration 307: let a contract milestone's sequence be a decimal (1.5, 2.25, ...)
-- project_milestones.sequence was INTEGER, so a milestone could only be placed
-- at a whole position and there was no way to slot one between 1 and 2 without
-- renumbering the rest. It is only an ordering key (ORDER BY sequence, and the
-- # column on the contract screen); nothing does arithmetic on it.
--
-- NUMERIC(10,2): two decimal places, which is what the form's step allows.
-- Existing whole numbers convert unchanged (1 -> 1.00). The column default 0
-- is kept, and idx_milestones_contract (contract_id, sequence) is rebuilt by
-- Postgres as part of the type change. No view, trigger or other column depends
-- on it (checked on production before writing this).
ALTER TABLE project_milestones
  ALTER COLUMN sequence TYPE NUMERIC(10,2) USING sequence::numeric;
