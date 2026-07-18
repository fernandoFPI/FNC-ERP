-- Migration 143: Engineering Documents
-- Discipline-based document management replacing scope items + drawing register.
-- Reference format: {rfq_number}-{DISC}-{TYPE}-{seq:04d}  e.g. RFQ-2026-0002-CIV-DRG-0003
-- Revisioning uses doc_group_id + is_current flag instead of parent-child tree.

CREATE TABLE engineering_documents (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID         NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  company_id       UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ref_number       VARCHAR(150) NOT NULL,
  discipline       VARCHAR(30)  NOT NULL
    CHECK (discipline IN ('civil','structural','architectural','electrical','ist','mechanical','others')),
  doc_type         VARCHAR(30)  NOT NULL
    CHECK (doc_type IN ('calculation','drawing','datasheet','specification','other')),
  seq_no           INTEGER      NOT NULL,
  title            VARCHAR(255) NOT NULL,
  description      TEXT,
  scale            VARCHAR(50),
  paper_size       VARCHAR(30),
  revision         VARCHAR(20),
  status           VARCHAR(30)  NOT NULL DEFAULT 'preliminary'
    CHECK (status IN ('preliminary','for_review','for_construction','as_built','cancelled','superseded')),
  issue_date       DATE,
  notes            TEXT,
  file_id          UUID         REFERENCES files(id),
  doc_group_id     UUID         NOT NULL DEFAULT uuid_generate_v4(),
  is_current       BOOLEAN      NOT NULL DEFAULT true,
  uploaded_by_id   UUID         REFERENCES users(id),
  uploaded_by_name VARCHAR(255),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eng_docs_project ON engineering_documents(project_id, discipline, doc_type);
CREATE INDEX idx_eng_docs_group   ON engineering_documents(doc_group_id);
-- Enforce exactly one current version per document group
CREATE UNIQUE INDEX uq_eng_doc_group_current ON engineering_documents(doc_group_id) WHERE is_current = true;
