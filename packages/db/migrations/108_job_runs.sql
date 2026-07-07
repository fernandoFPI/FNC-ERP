CREATE TABLE IF NOT EXISTS job_runs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name    VARCHAR(100) NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_msg   TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_name   ON job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at ON job_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status     ON job_runs(status);
