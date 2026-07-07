import { Router, type IRouter } from 'express'
import { requireAuth, requireRole } from '@fnc-erp/auth'
import { listJobRuns, getJobSummaries } from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'
import type { Request, Response } from 'express'

const log = logger.child({ module: 'job-runs' })

export const jobRunsRouter: IRouter = Router()

const requireAdmin = [requireAuth(), requireRole('system_admin')]

// GET /api/v1/admin/job-runs/summary  — one row per job with 7-day stats
jobRunsRouter.get('/summary', ...requireAdmin, async (_req: Request, res: Response) => {
  try {
    const summaries = await getJobSummaries()
    res.json({ summaries })
  } catch (err) {
    log.error({ err }, 'job-runs summary GET failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

// GET /api/v1/admin/job-runs?job_name=&status=&limit=50&offset=0
jobRunsRouter.get('/', ...requireAdmin, async (req: Request, res: Response) => {
  const jobName = typeof req.query['job_name'] === 'string' ? req.query['job_name'] : undefined
  const status  = typeof req.query['status']   === 'string' ? req.query['status']   : undefined
  const limit   = Math.min(parseInt(String(req.query['limit']  ?? '50'),  10) || 50,  200)
  const offset  = Math.max(parseInt(String(req.query['offset'] ?? '0'),   10) || 0,   0)

  try {
    const result = await listJobRuns({
      ...(jobName ? { jobName } : {}),
      ...(status  ? { status  } : {}),
      limit,
      offset,
    })
    res.json(result)
  } catch (err) {
    log.error({ err }, 'job-runs list GET failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})
