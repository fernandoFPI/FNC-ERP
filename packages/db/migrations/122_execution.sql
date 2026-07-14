-- Migration 122: Execution module — RFIs, Submittals, Site Instructions, QA/QC (ITPs+IRs+NCRs), HSE, Transmittals

-- RFIs (Requests for Information)
CREATE TABLE IF NOT EXISTS project_rfis (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rfi_number        VARCHAR(50)   NOT NULL,
  subject           VARCHAR(255)  NOT NULL,
  description       TEXT,
  drawing_ref       VARCHAR(255),
  spec_ref          VARCHAR(255),
  raised_by_id      UUID          REFERENCES users(id),
  raised_by_name    VARCHAR(255),
  raised_date       DATE          NOT NULL DEFAULT CURRENT_DATE,
  required_date     DATE,
  responded_date    DATE,
  status            VARCHAR(20)   NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open','responded','closed')),
  response          TEXT,
  responded_by_name VARCHAR(255),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, rfi_number)
);
CREATE INDEX IF NOT EXISTS idx_rfis_project ON project_rfis(project_id);

-- Submittals
CREATE TABLE IF NOT EXISTS project_submittals (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submittal_number VARCHAR(50)   NOT NULL,
  title            VARCHAR(255)  NOT NULL,
  submittal_type   VARCHAR(50)   NOT NULL DEFAULT 'shop_drawing'
                                 CHECK (submittal_type IN ('shop_drawing','method_statement','material_datasheet','certificate','om_manual','other')),
  revision         VARCHAR(10)   NOT NULL DEFAULT 'A',
  submitted_date   DATE,
  reviewer_name    VARCHAR(255),
  review_status    VARCHAR(30)   NOT NULL DEFAULT 'pending'
                                 CHECK (review_status IN ('pending','approved','approved_with_comments','rejected','resubmit')),
  return_date      DATE,
  remarks          TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_submittals_project ON project_submittals(project_id);

-- Site Instructions
CREATE TABLE IF NOT EXISTS project_site_instructions (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  si_number            VARCHAR(50)   NOT NULL,
  subject              VARCHAR(255)  NOT NULL,
  description          TEXT,
  issued_by            VARCHAR(255),
  issued_date          DATE          NOT NULL DEFAULT CURRENT_DATE,
  acknowledged_by_name VARCHAR(255),
  acknowledged_date    DATE,
  potential_vo         BOOLEAN       NOT NULL DEFAULT false,
  vo_ref               VARCHAR(100),
  status               VARCHAR(20)   NOT NULL DEFAULT 'open'
                                     CHECK (status IN ('open','acknowledged','closed')),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, si_number)
);
CREATE INDEX IF NOT EXISTS idx_sis_project ON project_site_instructions(project_id);

-- Inspection Test Plans (headers)
CREATE TABLE IF NOT EXISTS project_itps (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           VARCHAR(255)  NOT NULL,
  work_package    VARCHAR(255),
  discipline      VARCHAR(50),
  revision        VARCHAR(10)   NOT NULL DEFAULT 'A',
  status          VARCHAR(20)   NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','approved','active','closed')),
  created_by_id   UUID          REFERENCES users(id),
  created_by_name VARCHAR(255),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_itps_project ON project_itps(project_id);

-- ITP line items (the checklist rows)
CREATE TABLE IF NOT EXISTS project_itp_items (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  itp_id              UUID          NOT NULL REFERENCES project_itps(id) ON DELETE CASCADE,
  sequence            INTEGER       NOT NULL DEFAULT 0,
  activity            VARCHAR(255)  NOT NULL,
  inspection_type     VARCHAR(20)   NOT NULL DEFAULT 'check'
                                    CHECK (inspection_type IN ('check','hold','witness','review')),
  contractor_role     VARCHAR(100),
  client_role         VARCHAR(100),
  reference_doc       VARCHAR(255),
  acceptance_criteria TEXT,
  result              VARCHAR(20)   CHECK (result IN ('pass','fail','na','pending')),
  inspector_name      VARCHAR(255),
  inspection_date     DATE,
  remarks             TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_itp_items ON project_itp_items(itp_id);

-- Inspection Requests
CREATE TABLE IF NOT EXISTS project_inspection_requests (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ir_number         VARCHAR(50)   NOT NULL,
  title             VARCHAR(255)  NOT NULL,
  itp_id            UUID          REFERENCES project_itps(id),
  work_package      VARCHAR(255),
  location          VARCHAR(255),
  requested_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
  requested_by_name VARCHAR(255),
  inspector_name    VARCHAR(255),
  actual_date       DATE,
  status            VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','accepted','rejected','closed')),
  result            VARCHAR(30)   CHECK (result IN ('accepted','accepted_with_punch','rejected')),
  remarks           TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, ir_number)
);
CREATE INDEX IF NOT EXISTS idx_irs_project ON project_inspection_requests(project_id);

-- Non-Conformance Reports
CREATE TABLE IF NOT EXISTS project_ncrs (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ncr_number         VARCHAR(50)   NOT NULL,
  title              VARCHAR(255)  NOT NULL,
  description        TEXT          NOT NULL,
  work_package       VARCHAR(255),
  location           VARCHAR(255),
  raised_by_name     VARCHAR(255),
  raised_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  severity           VARCHAR(20)   NOT NULL DEFAULT 'minor'
                                   CHECK (severity IN ('minor','major','critical')),
  root_cause         TEXT,
  corrective_action  TEXT,
  preventive_action  TEXT,
  due_date           DATE,
  closed_date        DATE,
  closed_by_name     VARCHAR(255),
  status             VARCHAR(20)   NOT NULL DEFAULT 'open'
                                   CHECK (status IN ('open','pending_close','closed')),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, ncr_number)
);
CREATE INDEX IF NOT EXISTS idx_ncrs_project ON project_ncrs(project_id);

-- HSE Records (type-discriminated: toolbox_talk | incident | observation | ptw)
CREATE TABLE IF NOT EXISTS project_hse_records (
  id                     UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id             UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  record_type            VARCHAR(20)   NOT NULL
                                       CHECK (record_type IN ('toolbox_talk','incident','observation','ptw')),
  title                  VARCHAR(255)  NOT NULL,
  record_date            DATE          NOT NULL DEFAULT CURRENT_DATE,
  conducted_by           VARCHAR(255),
  location               VARCHAR(255),
  description            TEXT,
  -- toolbox talk fields
  attendee_count         INTEGER,
  attendee_names         TEXT,
  -- incident fields
  incident_type          VARCHAR(30)   CHECK (incident_type IN ('near_miss','first_aid','lti','dangerous_occurrence','fatality')),
  severity               VARCHAR(20)   CHECK (severity IN ('low','medium','high','critical')),
  injured_person         VARCHAR(255),
  root_cause             TEXT,
  corrective_action      TEXT,
  corrective_due_date    DATE,
  corrective_closed_date DATE,
  -- observation fields
  observation_type       VARCHAR(10)   CHECK (observation_type IN ('good','bad')),
  -- PTW fields
  ptw_type               VARCHAR(30)   CHECK (ptw_type IN ('hot_work','confined_space','working_at_height','electrical','excavation','general')),
  ptw_number             VARCHAR(50),
  valid_from             TIMESTAMPTZ,
  valid_to               TIMESTAMPTZ,
  approved_by            VARCHAR(255),
  ptw_status             VARCHAR(20)   CHECK (ptw_status IN ('pending','active','expired','cancelled')),
  -- shared meta
  status                 VARCHAR(20)   NOT NULL DEFAULT 'open'
                                       CHECK (status IN ('open','closed')),
  created_by_id          UUID          REFERENCES users(id),
  created_by_name        VARCHAR(255),
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hse_project ON project_hse_records(project_id);

-- Transmittals (document distribution records)
CREATE TABLE IF NOT EXISTS project_transmittals (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  transmittal_number VARCHAR(50)   NOT NULL,
  title              VARCHAR(255)  NOT NULL,
  to_company         VARCHAR(255),
  to_contact         VARCHAR(255),
  from_name          VARCHAR(255),
  sent_date          DATE          NOT NULL DEFAULT CURRENT_DATE,
  purpose            VARCHAR(30)   NOT NULL DEFAULT 'for_approval'
                                   CHECK (purpose IN ('for_approval','for_information','for_review','for_record','as_built')),
  acknowledged_date  DATE,
  notes              TEXT,
  status             VARCHAR(20)   NOT NULL DEFAULT 'sent'
                                   CHECK (status IN ('sent','acknowledged','superseded')),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, transmittal_number)
);
CREATE INDEX IF NOT EXISTS idx_transmittals_project ON project_transmittals(project_id);

-- Transmittal line items (each document in the transmittal)
CREATE TABLE IF NOT EXISTS project_transmittal_items (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  transmittal_id   UUID          NOT NULL REFERENCES project_transmittals(id) ON DELETE CASCADE,
  document_title   VARCHAR(255)  NOT NULL,
  document_number  VARCHAR(100),
  revision         VARCHAR(20),
  file_id          UUID          REFERENCES files(id),
  copies           INTEGER       NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transmittal_items ON project_transmittal_items(transmittal_id);
