-- Migration 320: withholding tax (WHT) on the project itself.
--
-- The new-RFQ and edit-project forms replace Budget Amount with a withholding tax block, the same three
-- settings an invoice carries (migration 063): whether it applies, the scenario (the client withholds and
-- pays the tax authority, or the client pays in full and FNC remits annually) and the rate. The system
-- shows how much tax the project will carry as  Bid Price (projects.project_value) x rate.
--
-- Only the settings are stored. The amount is NOT a column: it is always calculated from the current bid
-- price, so editing the bid price can never leave a stale tax figure behind.
--
-- Every existing project starts with WHT off (nothing changes for them). The rate is a fraction, 0.03 = 3%,
-- like project_invoices.wht_rate.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS wht_applies  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wht_scenario VARCHAR(20)
    CHECK (wht_scenario IN ('client_withholds','fnc_pays')),
  ADD COLUMN IF NOT EXISTS wht_rate     NUMERIC(5,4) NOT NULL DEFAULT 0;

-- A project that applies WHT must say who pays it; one that does not carries no scenario and a zero rate.
ALTER TABLE projects
  ADD CONSTRAINT projects_wht_consistent CHECK (
    wht_rate >= 0 AND wht_rate <= 1
    AND ( (wht_applies = FALSE AND wht_scenario IS NULL AND wht_rate = 0)
       OR (wht_applies = TRUE  AND wht_scenario IS NOT NULL) )
  );

COMMENT ON COLUMN projects.wht_applies  IS 'Withholding tax applies to this project (estimate only; invoices carry their own WHT settings)';
COMMENT ON COLUMN projects.wht_scenario IS 'client_withholds = client deducts and pays the tax authority; fnc_pays = client pays in full, FNC remits annually';
COMMENT ON COLUMN projects.wht_rate     IS 'Fraction, 0.03 = 3%. Tax amount = project_value x wht_rate, calculated on read, never stored';
