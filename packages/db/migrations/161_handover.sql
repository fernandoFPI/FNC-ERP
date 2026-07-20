-- Migration 161: Project Handover Certificates & Checklist Items
-- Covers formal handover process: certificate issuance, client acceptance, DLP tracking

CREATE TABLE project_handover_certificates (
  id                     UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id             UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  certificate_no         VARCHAR(20)  NOT NULL,
  title                  VARCHAR(255) NOT NULL,
  area_zone              VARCHAR(100),
  handover_date          DATE,
  accepted_date          DATE,
  contractor_rep         VARCHAR(100),
  client_rep             VARCHAR(100),
  status                 VARCHAR(30)  NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','pending_acceptance','accepted','rejected')),
  defect_liability_start DATE,
  defect_liability_end   DATE,
  notes                  TEXT,
  created_by_id          UUID         REFERENCES users(id),
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, certificate_no)
);

CREATE TABLE project_handover_items (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  certificate_id UUID         NOT NULL REFERENCES project_handover_certificates(id) ON DELETE CASCADE,
  sequence       INT          NOT NULL DEFAULT 1,
  category       VARCHAR(50)  NOT NULL DEFAULT 'other'
    CHECK (category IN ('documentation','systems','utilities','safety','training','spares','punchlists','keys_access','other')),
  description    VARCHAR(500) NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','waived')),
  verified_by    VARCHAR(100),
  verified_at    TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phc_project ON project_handover_certificates(project_id);
CREATE INDEX idx_phc_status  ON project_handover_certificates(project_id, status);
CREATE INDEX idx_phi_cert    ON project_handover_items(certificate_id);

COMMENT ON TABLE project_handover_certificates IS 'Formal handover certificates issued at project or zone completion';
COMMENT ON TABLE project_handover_items        IS 'Checklist items within each handover certificate';
