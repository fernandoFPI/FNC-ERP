-- Migration 087: Project activity log — tracks all changes, not just status transitions
CREATE TABLE IF NOT EXISTS project_activity_log (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type  VARCHAR(50) NOT NULL,
  summary     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pal_project ON project_activity_log(project_id, created_at DESC);

-- Backfill existing status history into the new log
INSERT INTO project_activity_log (project_id, actor_id, event_type, summary, created_at)
SELECT
  h.project_id,
  h.changed_by,
  'status_change',
  CASE
    WHEN h.from_status IS NULL THEN 'Project created with status: ' || h.to_status
    ELSE 'Status changed: ' || h.from_status || ' → ' || h.to_status
       || CASE WHEN h.reason IS NOT NULL THEN ' ("' || h.reason || '")' ELSE '' END
  END,
  h.created_at
FROM project_status_history h;
