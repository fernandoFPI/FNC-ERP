-- Migration 153: Interface Action Items (PRODOM Phase 4)
-- Each interface may have multiple action items assigned to specific owners.
-- Overdue: due_date < NOW() and status != 'closed'.

CREATE TABLE project_interface_actions (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  interface_id  UUID         NOT NULL REFERENCES project_interfaces(id) ON DELETE CASCADE,
  description   TEXT         NOT NULL,
  owner         VARCHAR(255),
  due_date      DATE,
  status        VARCHAR(20)  NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','closed')),
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_iface_actions_interface ON project_interface_actions(interface_id);
CREATE INDEX idx_iface_actions_status    ON project_interface_actions(status);

COMMENT ON TABLE project_interface_actions IS
  'Action items under each interface point. Overdue actions (due_date < NOW, status != closed) '
  'feed into the project dashboard ATR summary.';
