-- default_margin_pct / retention_pct were NUMERIC(5,4) -- 5 total digits, 4
-- after the decimal, leaving room for only 1 digit before it (max 9.9999).
-- Both fields are filled in as a plain percentage number ("Default Margin %",
-- "Retention %" -- e.g. type 10 for 10%, see ContractForm.tsx) and sent
-- through unscaled (createProjectContract, resolvers.ts), so any value 10 or
-- above overflowed -- not an edge case, since retention is commonly 5-10%
-- and margins are often 10%+ on a real contract.
--
-- Widened to NUMERIC(7,4) (room up to 999.9999) -- same convention (a plain
-- percentage number, 4 decimal places of precision), just enough digits
-- before the decimal for it to actually work.
ALTER TABLE project_contracts
  ALTER COLUMN default_margin_pct TYPE NUMERIC(7,4),
  ALTER COLUMN retention_pct TYPE NUMERIC(7,4);
