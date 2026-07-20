-- Migration 163: Engineering document review reminders (for escalating notifications)
-- The notifications table already exists from an earlier migration.

CREATE TABLE eng_doc_review_reminders (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id       UUID         NOT NULL REFERENCES engineering_documents(id) ON DELETE CASCADE,
  project_id        UUID         NOT NULL,
  company_id        UUID         NOT NULL,
  reviewer_user_id  UUID         REFERENCES users(id),
  reviewer_name     VARCHAR(200),
  reviewer_email    VARCHAR(255),
  role              VARCHAR(20)  NOT NULL CHECK (role IN ('checker', 'approver')),
  due_date          DATE         NOT NULL,
  reminder_count    INT          NOT NULL DEFAULT 0,
  last_reminded_at  TIMESTAMPTZ,
  next_remind_at    TIMESTAMPTZ  NOT NULL,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, role)
);

-- Index for the worker polling query
CREATE INDEX idx_edrr_pending ON eng_doc_review_reminders(next_remind_at)
  WHERE resolved_at IS NULL;

CREATE INDEX idx_edrr_document ON eng_doc_review_reminders(document_id);

COMMENT ON TABLE  eng_doc_review_reminders IS 'Tracks active checker/approver assignments for escalating overdue reminders';
COMMENT ON COLUMN eng_doc_review_reminders.reminder_count IS '0=initial sent, 1=due date reminder, 2=1d overdue, 3=3d overdue, 4+=critical';
COMMENT ON COLUMN eng_doc_review_reminders.next_remind_at IS 'Next scheduled escalation; NULL once resolved';
