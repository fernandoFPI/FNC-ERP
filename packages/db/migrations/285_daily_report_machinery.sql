BEGIN;

-- Machinery POs logged against a Daily Report. Distinct from the free-text
-- equipment_utilization JSONB on project_daily_reports (which just logs
-- working/idle/breakdown hours for equipment on site, no PO involved) —
-- this table links a specific purchase order to the report and requires a
-- live photo as compliance evidence. live_photo_file_id IS NULL means that
-- entry is non-compliant; PurchaseOrder.machineryPhotoAlert (gateway
-- resolver) checks for any non-compliant row against a given po_id, so the
-- alert clears itself automatically once every gap is backfilled with a
-- photo — no separate status column to keep in sync.
CREATE TABLE IF NOT EXISTS project_daily_report_machinery (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_report_id       UUID          NOT NULL REFERENCES project_daily_reports(id) ON DELETE CASCADE,
  project_id            UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  po_id                 UUID          NOT NULL REFERENCES purchase_orders(id),
  equipment_description VARCHAR(255),
  working_hours         NUMERIC(10,2),
  idle_hours            NUMERIC(10,2),
  breakdown_hours       NUMERIC(10,2),
  live_photo_file_id    UUID          REFERENCES files(id),
  created_by_id         UUID          REFERENCES users(id),
  created_by_name       VARCHAR(255),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_report_machinery_report ON project_daily_report_machinery(daily_report_id);
CREATE INDEX IF NOT EXISTS idx_daily_report_machinery_po ON project_daily_report_machinery(po_id);
CREATE INDEX IF NOT EXISTS idx_daily_report_machinery_project ON project_daily_report_machinery(project_id);

COMMIT;
