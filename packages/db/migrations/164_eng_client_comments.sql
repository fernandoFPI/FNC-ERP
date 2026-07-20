-- Migration 164: Client Comment Register for Engineering Documents
-- When a client returns Code B (Approved with Comments) or Code D (For Information),
-- the comments are logged here and tracked until resolved.

CREATE TABLE eng_client_comments (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id    UUID         NOT NULL REFERENCES engineering_documents(id) ON DELETE CASCADE,
  comment_no     INT          NOT NULL,
  description    TEXT         NOT NULL,
  clause_ref     VARCHAR(100),
  category       VARCHAR(50)  NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','technical','contractual','administrative')),
  status         VARCHAR(20)  NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed','waived')),
  resolution     TEXT,
  raised_by      VARCHAR(150),
  closed_by_name VARCHAR(150),
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, comment_no)
);

CREATE INDEX idx_ecc_doc    ON eng_client_comments(document_id);
CREATE INDEX idx_ecc_status ON eng_client_comments(document_id, status);

COMMENT ON TABLE  eng_client_comments              IS 'Client comments received with Code B/D responses; tracked open/closed per document';
COMMENT ON COLUMN eng_client_comments.comment_no   IS 'Sequential per document, auto-assigned on insert';
COMMENT ON COLUMN eng_client_comments.clause_ref   IS 'Clause or section of the document the comment refers to';
COMMENT ON COLUMN eng_client_comments.category     IS 'general | technical | contractual | administrative';
COMMENT ON COLUMN eng_client_comments.resolution   IS 'How the comment was addressed when closing';
