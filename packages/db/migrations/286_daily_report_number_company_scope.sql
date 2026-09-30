BEGIN;

-- Fixes a bug in migration 284: report_number was UNIQUE globally instead of
-- scoped per company like every other numbered-document table (po_number,
-- invoice_number, requisition_number all use UNIQUE(company_id, number)).
-- The DPR document_sequences counter restarts at 1 per company, so two
-- companies' first report of the year would both compute the same number
-- and the second INSERT would fail on the old global constraint.
ALTER TABLE project_daily_reports ADD COLUMN company_id UUID REFERENCES companies(id);
UPDATE project_daily_reports dr SET company_id = p.company_id
  FROM projects p WHERE p.id = dr.project_id;
ALTER TABLE project_daily_reports ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE project_daily_reports DROP CONSTRAINT project_daily_reports_report_number_key;
ALTER TABLE project_daily_reports ADD CONSTRAINT project_daily_reports_company_report_number_key
  UNIQUE (company_id, report_number);

CREATE INDEX IF NOT EXISTS idx_daily_reports_company ON project_daily_reports(company_id);

COMMIT;
