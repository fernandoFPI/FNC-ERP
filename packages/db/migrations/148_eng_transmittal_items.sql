-- Migration 148: Engineering Document Transmittal Line Items (PRODOM Phase 2)
-- Each row is one engineering document included in a transmittal.
-- For outgoing: document_id links to engineering_documents (must exist in register).
-- For incoming: document_id may be null if the received document is not yet in the register.

CREATE TABLE project_eng_transmittal_items (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  transmittal_id   UUID         NOT NULL REFERENCES project_eng_transmittals(id) ON DELETE CASCADE,
  -- For outgoing: always required; for incoming: optional until filed
  document_id      UUID         REFERENCES engineering_documents(id),
  -- Free-text fields for incoming docs not yet in the register
  ext_ref_number   VARCHAR(100),
  ext_title        VARCHAR(255),
  -- Snapshot at time of transmittal (revision may advance after issue)
  revision         VARCHAR(20),
  copies           INTEGER      NOT NULL DEFAULT 1,
  format           VARCHAR(20)  NOT NULL DEFAULT 'PDF'
    CHECK (format IN ('PDF','DWG','Native','Hard Copy')),
  -- Purpose of this specific document in the transmittal
  purpose_of_issue VARCHAR(20)
    CHECK (purpose_of_issue IN ('IFA','IFR','IFI','IFC','AFC','For Record','For Information')),
  remarks          TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (transmittal_id, document_id)
);

CREATE INDEX idx_eng_tr_items_tr  ON project_eng_transmittal_items(transmittal_id);
CREATE INDEX idx_eng_tr_items_doc ON project_eng_transmittal_items(document_id);

COMMENT ON TABLE project_eng_transmittal_items IS
  'Line items within an engineering transmittal. Outgoing items reference engineering_documents by FK. '
  'Incoming items may use ext_ref_number/ext_title until the doc is filed in the register.';
