BEGIN;

-- EPC-style Daily Progress Report, one row per report filed against a
-- project. The template (HSE stats, engineering/procurement/construction
-- progress, manpower, equipment, risks, client actions, look-ahead, etc.)
-- has ~14 repeating-table sections — stored as JSONB rather than one table
-- per section since every section is always read/written as part of a
-- single report snapshot, never queried independently.
CREATE TABLE IF NOT EXISTS project_daily_reports (
  id                      UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id              UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_number           VARCHAR(50)   NOT NULL,
  report_date             DATE          NOT NULL DEFAULT CURRENT_DATE,
  prepared_by             VARCHAR(255),
  reviewed_by             VARCHAR(255),
  weather_conditions      VARCHAR(255),
  temperature             VARCHAR(50),
  schedule_status         VARCHAR(20)   CHECK (schedule_status IN ('on_track','at_risk','delayed')),
  cost_status             VARCHAR(20)   CHECK (cost_status IN ('on_budget','at_risk','over_budget')),
  safety_status           VARCHAR(20)   CHECK (safety_status IN ('good','fair','poor')),
  quality_status          VARCHAR(20)   CHECK (quality_status IN ('good','fair','poor')),
  key_accomplishments     TEXT,
  major_concerns          TEXT,
  progress_metrics        JSONB         NOT NULL DEFAULT '[]',
  safety_stats            JSONB         NOT NULL DEFAULT '[]',
  safety_activities       JSONB         NOT NULL DEFAULT '[]',
  safety_remarks          TEXT,
  engineering_progress    JSONB         NOT NULL DEFAULT '[]',
  engineering_deliverables JSONB        NOT NULL DEFAULT '[]',
  engineering_issues      TEXT,
  procurement_items       JSONB         NOT NULL DEFAULT '[]',
  deliveries_received     JSONB         NOT NULL DEFAULT '[]',
  procurement_concerns    TEXT,
  construction_progress   JSONB         NOT NULL DEFAULT '[]',
  qc_inspections          JSONB         NOT NULL DEFAULT '[]',
  ncr_status              JSONB         NOT NULL DEFAULT '[]',
  quality_remarks         TEXT,
  manpower                JSONB         NOT NULL DEFAULT '[]',
  equipment_utilization   JSONB         NOT NULL DEFAULT '[]',
  breakdown_details       TEXT,
  risks_issues            JSONB         NOT NULL DEFAULT '[]',
  client_actions          JSONB         NOT NULL DEFAULT '[]',
  lookahead_engineering   TEXT,
  lookahead_procurement   TEXT,
  lookahead_construction  TEXT,
  lookahead_commissioning TEXT,
  management_comments     TEXT,
  created_by_id           UUID          REFERENCES users(id),
  created_by_name         VARCHAR(255),
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (report_number)
);
CREATE INDEX IF NOT EXISTS idx_daily_reports_project ON project_daily_reports(project_id, report_date DESC);

-- Seed document_sequences for the new 'daily_report' doc type, one row per
-- company, mirroring the requisition/REQ seeding in migration 261 (values
-- are hardcoded literals for DPR; the join on doc_type='purchase_order' is
-- only there to enumerate one row per existing company).
INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
SELECT company_id, 'daily_report', 'DPR', 1, 4, true, '-'
FROM document_sequences
WHERE doc_type = 'purchase_order'
ON CONFLICT (company_id, doc_type) DO NOTHING;

-- Widen entity_type additively so a daily report's photographic record can
-- attach files via the same document_attachments table every other
-- execution entity uses. Full current list carried forward unchanged from
-- migration 264, the most recent prior writer of this constraint — only
-- 'daily_report' is new.
ALTER TABLE document_attachments DROP CONSTRAINT document_attachments_entity_type_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order', 'po_receipt', 'project_contract', 'project_invoice', 'project',
    'vendor', 'employee', 'payroll_run', 'manufacturing_order', 'rental_contract',
    'interco_transaction', 'po_return', 'rfq_phase', 'rfi', 'submittal',
    'site_instruction', 'inspection_request', 'ncr', 'hse_record', 'transmittal',
    'bid_deliverable', 'bid_package_technical', 'bid_package_commercial',
    'handover_cert', 'material_issue', 'tq', 'po_line_purchase', 'daily_report'
  ));

COMMIT;
