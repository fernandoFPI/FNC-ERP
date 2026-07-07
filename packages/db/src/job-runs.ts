import { pool } from './client.js'

export interface JobRun {
  id: string
  job_name: string
  status: 'running' | 'success' | 'partial' | 'failed'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  error_msg: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

export interface JobSummary {
  job_name: string
  last_run_at: string | null
  last_status: string | null
  last_duration_ms: number | null
  success_7d: number
  failed_7d: number
}

export async function startJobRun(
  jobName: string,
  meta?: Record<string, unknown>,
): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO job_runs (job_name, status, meta)
     VALUES ($1, 'running', $2)
     RETURNING id`,
    [jobName, meta ? JSON.stringify(meta) : null],
  )
  return res.rows[0]!.id
}

export async function finishJobRun(
  id: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `UPDATE job_runs
     SET status      = 'success',
         finished_at = NOW(),
         duration_ms = ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::integer,
         meta        = COALESCE($2::jsonb, meta)
     WHERE id = $1`,
    [id, meta ? JSON.stringify(meta) : null],
  )
}

export async function partialJobRun(
  id: string,
  errorMsg: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `UPDATE job_runs
     SET status      = 'partial',
         finished_at = NOW(),
         duration_ms = ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::integer,
         error_msg   = $2,
         meta        = COALESCE($3::jsonb, meta)
     WHERE id = $1`,
    [id, errorMsg, meta ? JSON.stringify(meta) : null],
  )
}

export async function failJobRun(id: string, errorMsg: string): Promise<void> {
  await pool.query(
    `UPDATE job_runs
     SET status      = 'failed',
         finished_at = NOW(),
         duration_ms = ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::integer,
         error_msg   = $2
     WHERE id = $1`,
    [id, errorMsg],
  )
}

// For jobs that run too frequently to use start/finish pairs (e.g. outbox every 5s).
// Inserts a single completed record with back-calculated started_at.
export async function recordCompletedJobRun(
  jobName: string,
  status: 'success' | 'partial' | 'failed',
  durationMs: number,
  meta?: Record<string, unknown>,
  errorMsg?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO job_runs
       (job_name, status, started_at, finished_at, duration_ms, meta, error_msg)
     VALUES (
       $1, $2,
       NOW() - ($3::numeric * INTERVAL '1 millisecond'),
       NOW(),
       $3,
       $4,
       $5
     )`,
    [
      jobName,
      status,
      durationMs,
      meta ? JSON.stringify(meta) : null,
      errorMsg ?? null,
    ],
  )
}

export async function listJobRuns(opts: {
  jobName?: string
  status?: string
  limit?: number
  offset?: number
}): Promise<{ runs: JobRun[]; total: number }> {
  const conditions: string[] = []
  const filterParams: unknown[] = []
  let pi = 1

  if (opts.jobName) {
    conditions.push(`job_name = $${pi++}`)
    filterParams.push(opts.jobName)
  }
  if (opts.status) {
    conditions.push(`status = $${pi++}`)
    filterParams.push(opts.status)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit  = Math.min(opts.limit ?? 50, 200)
  const offset = opts.offset ?? 0

  const [dataRes, countRes] = await Promise.all([
    pool.query<JobRun>(
      `SELECT id, job_name, status, started_at, finished_at,
              duration_ms, error_msg, meta, created_at
       FROM job_runs ${where}
       ORDER BY started_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...filterParams, limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM job_runs ${where}`,
      filterParams,
    ),
  ])

  return {
    runs: dataRes.rows,
    total: parseInt(countRes.rows[0]!.count, 10),
  }
}

export async function getJobSummaries(): Promise<JobSummary[]> {
  const res = await pool.query<JobSummary>(`
    WITH latest AS (
      SELECT DISTINCT ON (job_name)
        job_name,
        status      AS last_status,
        started_at  AS last_run_at,
        duration_ms AS last_duration_ms
      FROM job_runs
      WHERE status != 'running'
      ORDER BY job_name, started_at DESC
    ),
    counts AS (
      SELECT
        job_name,
        COUNT(*) FILTER (
          WHERE status = 'success'
            AND started_at > NOW() - INTERVAL '7 days'
        ) AS success_7d,
        COUNT(*) FILTER (
          WHERE status IN ('failed', 'partial')
            AND started_at > NOW() - INTERVAL '7 days'
        ) AS failed_7d
      FROM job_runs
      GROUP BY job_name
    )
    SELECT
      COALESCE(l.job_name, c.job_name)  AS job_name,
      l.last_status,
      l.last_run_at,
      l.last_duration_ms,
      COALESCE(c.success_7d, 0)         AS success_7d,
      COALESCE(c.failed_7d, 0)          AS failed_7d
    FROM latest l
    FULL OUTER JOIN counts c USING (job_name)
    ORDER BY COALESCE(l.last_run_at, '1970-01-01'::timestamptz) DESC
  `)
  return res.rows
}

export const JOB_NAMES = [
  'fx-sync',
  'fx-staleness-check',
  'outbox-processor',
  'rental-billing',
  'payroll-reminder',
  'low-stock-alert',
  'contract-expiry-alerts',
  'asset-depreciation',
  'file-cleanup-pending',
  'file-cleanup-unattached',
  'maintenance-due-check',
  'maintenance-overdue-mark',
] as const
