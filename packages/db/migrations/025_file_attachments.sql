-- ── FILE REGISTRY ──────────────────────────────────────────────
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_key VARCHAR(500) NOT NULL UNIQUE,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  category VARCHAR(50) NOT NULL
    CHECK (category IN ('contract','identity','attachment','report')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','uploaded','attached','orphaned','deleted')),
  upload_url_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DOCUMENT ATTACHMENTS ───────────────────────────────────────
CREATE TABLE document_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL
    CHECK (entity_type IN (
      'purchase_order',
      'po_receipt',
      'project_contract',
      'project_invoice',
      'project',
      'vendor',
      'employee',
      'payroll_run',
      'manufacturing_order',
      'rental_contract',
      'interco_transaction'
    )),
  entity_id UUID NOT NULL,
  label VARCHAR(255),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(file_id, entity_type, entity_id)
);

-- ── INDEXES ────────────────────────────────────────────────────
CREATE INDEX idx_files_company ON files(company_id);
CREATE INDEX idx_files_status ON files(status);
CREATE INDEX idx_files_pending ON files(status, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_attachments_entity ON document_attachments(entity_type, entity_id);
CREATE INDEX idx_attachments_file ON document_attachments(file_id);
