-- Migration 119: Client Documents per project
-- Central document repository for client-issued RFQ documents, drawings, BOQ, correspondence, etc.

CREATE TABLE IF NOT EXISTS project_client_documents (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID        NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  file_id           UUID        REFERENCES files(id),
  category          VARCHAR(50) NOT NULL DEFAULT 'other'
                                CHECK (category IN ('rfq_tender','drawings','boq_specs','correspondence','contracts','other')),
  title             VARCHAR(255) NOT NULL,
  document_number   VARCHAR(100),
  revision          VARCHAR(20),
  description       TEXT,
  received_from     VARCHAR(255),
  transmission_date DATE,
  status            VARCHAR(20) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','superseded','archived')),
  parent_document_id UUID       REFERENCES project_client_documents(id),
  uploaded_by_id    UUID        REFERENCES users(id),
  uploaded_by_name  VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_docs_project    ON project_client_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_client_docs_parent     ON project_client_documents(parent_document_id);
CREATE INDEX IF NOT EXISTS idx_client_docs_status     ON project_client_documents(status);
