-- Migration 167: Configurable tab/module display labels
-- Lets each company rename the project tabs (like phase labels), no code change.

ALTER TABLE lifecycle_phase_modules ADD COLUMN IF NOT EXISTS label VARCHAR(100);

-- Seed with the current tab labels (matches ALL_TABS, incl. client-requested names).
UPDATE lifecycle_phase_modules SET label = CASE module_key
  WHEN 'overview'         THEN 'Overview'
  WHEN 'client_documents' THEN 'Client Documents'
  WHEN 'rfq_lines'        THEN 'Preliminary Engineering'
  WHEN 'bidding'          THEN 'Bidding Stage'
  WHEN 'contracts'        THEN 'Contract Management'
  WHEN 'engineering'      THEN 'Planning & Detailed Engineering'
  WHEN 'execution'        THEN 'Execution'
  WHEN 'handover'         THEN 'Handover'
  WHEN 'procurement'      THEN 'Procurement'
  WHEN 'cost_control'     THEN 'Cost Control'
  WHEN 'variation_orders' THEN 'Variation Orders'
  WHEN 'risk_register'    THEN 'Risk Register'
  WHEN 'meetings'         THEN 'Meetings (MOM)'
  WHEN 'attachments'      THEN 'Attachments'
  WHEN 'team'             THEN 'Team'
  WHEN 'history'          THEN 'History'
  ELSE module_key
END
WHERE label IS NULL;

COMMENT ON COLUMN lifecycle_phase_modules.label IS 'Company-configurable display name for the project tab (falls back to code default if null)';
