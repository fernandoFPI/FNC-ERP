-- Migration 134: Meetings / MOM module

CREATE TABLE IF NOT EXISTS project_meetings (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  meeting_number    VARCHAR(50)   NOT NULL,
  meeting_type      VARCHAR(30)   NOT NULL DEFAULT 'site'
                      CHECK (meeting_type IN ('site','technical','commercial','kickoff','coordination','closeout','subcontractor','hse','other')),
  title             VARCHAR(255)  NOT NULL,
  meeting_date      DATE          NOT NULL,
  location          VARCHAR(255),
  chairperson       VARCHAR(255),
  attendees         TEXT,
  agenda            TEXT,
  minutes           TEXT,
  distribution_list TEXT,
  status            VARCHAR(20)   NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','issued','closed')),
  issued_at         TIMESTAMPTZ,
  created_by        UUID          REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, meeting_number)
);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON project_meetings(project_id);

CREATE TABLE IF NOT EXISTS project_meeting_actions (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id         UUID          NOT NULL REFERENCES project_meetings(id) ON DELETE CASCADE,
  action_number      INTEGER       NOT NULL DEFAULT 1,
  description        TEXT          NOT NULL,
  responsible_person VARCHAR(255),
  due_date           DATE,
  priority           VARCHAR(10)   NOT NULL DEFAULT 'medium'
                       CHECK (priority IN ('low','medium','high','critical')),
  status             VARCHAR(20)   NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','in_progress','closed')),
  closed_at          TIMESTAMPTZ,
  remarks            TEXT,
  carry_over_from    UUID          REFERENCES project_meeting_actions(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_meeting ON project_meeting_actions(meeting_id);

CREATE TABLE IF NOT EXISTS project_meeting_attachments (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id  UUID         NOT NULL REFERENCES project_meetings(id) ON DELETE CASCADE,
  file_id     UUID         NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  category    VARCHAR(20)  NOT NULL DEFAULT 'supporting'
                CHECK (category IN ('agenda','minutes','supporting','photo')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meeting_attachments_meeting ON project_meeting_attachments(meeting_id);
