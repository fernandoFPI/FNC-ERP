-- Document number sequences: per-company, per-document-type auto-increment config
CREATE TABLE IF NOT EXISTS document_sequences (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_type       VARCHAR(50) NOT NULL,
  prefix         VARCHAR(20) NOT NULL DEFAULT '',
  next_number    INTEGER     NOT NULL DEFAULT 1,
  pad_length     INTEGER     NOT NULL DEFAULT 4,
  year_in_number BOOLEAN     NOT NULL DEFAULT false,
  separator      VARCHAR(5)  NOT NULL DEFAULT '-',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_document_sequences_company ON document_sequences(company_id);
