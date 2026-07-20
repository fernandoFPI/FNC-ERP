-- Migration 162: Engineering Document Full Two-Track Workflow
-- Track 1 (internal): draft → under_check → under_approval → ready_to_issue
-- Track 2 (client):   ready_to_issue → IFA/IFR/IFC/IFI → client response → AFC/approved_with_comments/acknowledged/draft

-- Expand status constraint to include all new internal workflow states
ALTER TABLE engineering_documents DROP CONSTRAINT IF EXISTS engineering_documents_status_check;

ALTER TABLE engineering_documents ADD CONSTRAINT engineering_documents_status_check
  CHECK (status IN (
    -- Track 1: Internal
    'draft',            -- Author is working on document
    'under_check',      -- Sent to checker for internal review
    'under_approval',   -- Sent to internal approver
    'ready_to_issue',   -- Internally approved, ready to issue to client
    -- Track 2: Client submission codes
    'IFA',              -- Issued for Approval
    'IFR',              -- Issued for Review
    'IFI',              -- Issued for Information
    'IFC',              -- Issued for Construction
    -- Client response outcomes
    'AFC',                     -- Approved for Construction (response A)
    'approved_with_comments',  -- Approved with Comments   (response B)
    'acknowledged',            -- Acknowledged / received   (response D)
    -- Terminal / lifecycle
    'as_built',         -- As-built record finalized
    'superseded',       -- Replaced by a newer revision
    'cancelled',        -- Document cancelled / voided
    -- Legacy (backward compat)
    'preliminary', 'for_review', 'for_construction'
  ));

-- Activity log: every workflow transition
CREATE TABLE engineering_doc_activities (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID         NOT NULL REFERENCES engineering_documents(id) ON DELETE CASCADE,
  from_status     VARCHAR(30),
  to_status       VARCHAR(30)  NOT NULL,
  action          VARCHAR(60)  NOT NULL,
  actor_id        UUID         REFERENCES users(id),
  actor_name      VARCHAR(150),
  response_code   CHAR(1),
  transmittal_ref VARCHAR(60),
  submitted_to    VARCHAR(150),
  due_date        DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eda_document ON engineering_doc_activities(document_id);
CREATE INDEX idx_eda_recent   ON engineering_doc_activities(document_id, created_at DESC);

COMMENT ON TABLE  engineering_doc_activities                IS 'Audit trail of every workflow transition per engineering document';
COMMENT ON COLUMN engineering_doc_activities.response_code  IS 'Client review code: A=Approved, B=Approved with Comments, C=Not Approved (resubmit), D=For Information';
COMMENT ON COLUMN engineering_doc_activities.action         IS 'e.g. send_for_check, return_to_author, issue, record_client_response, mark_as_built';
