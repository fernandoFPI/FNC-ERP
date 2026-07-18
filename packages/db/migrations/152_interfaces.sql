-- Migration 152: Interface Register (PRODOM Phase 4)
-- Tracks formal handoffs between disciplines and subcontractors.
-- Each interface is a dependency between Party A and Party B where A must
-- deliver information/material to B by the agreed_date.
-- Status: identified → active → pending_response → agreed → closed

CREATE TABLE project_interfaces (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  interface_no  VARCHAR(30)  NOT NULL,
  -- The two parties to this interface
  party_a       VARCHAR(255) NOT NULL,
  party_b       VARCHAR(255) NOT NULL,
  -- Discipline on each side (used for matrix grouping)
  discipline_a  VARCHAR(50),
  discipline_b  VARCHAR(50),
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  -- When Party A must deliver to Party B
  agreed_date   DATE,
  priority      VARCHAR(10)  NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('high','normal','low')),
  status        VARCHAR(30)  NOT NULL DEFAULT 'identified'
    CHECK (status IN ('identified','active','pending_response','agreed','closed')),
  created_by_id UUID         REFERENCES users(id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, interface_no)
);

CREATE INDEX idx_interfaces_project ON project_interfaces(project_id);
CREATE INDEX idx_interfaces_status  ON project_interfaces(status);

COMMENT ON TABLE project_interfaces IS
  'Interface register per project. Each row is a formal tracked dependency between '
  'two disciplines or subcontractors. Action items are tracked in project_interface_actions.';
