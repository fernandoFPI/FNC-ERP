import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const exportsRouter: IRouter = Router()

// All report endpoints support ?format=json|csv|xlsx
// For CSV/XLSX: queue generation via outbox, return job_id
// Client polls GET /reporting/exports/:job_id

exportsRouter.get('/:jobId', requirePermission('reporting.financial.view', 'view'), async (req, res) => {
  try {
    const result = await query<{ id: string; status: string; payload: Record<string, unknown> }>(
      `SELECT id, status, payload FROM service_outbox WHERE id = $1`,
      [req.params['jobId']],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Export job not found')
    const job = result.rows[0]
    sendOk(res, {
      job_id: job['id'],
      status: job['status'] === 'processed' ? 'ready' : job['status'] === 'failed' ? 'failed' : 'pending',
      download_url: job['status'] === 'processed'
        ? `/reporting/exports/${job['id']}/download`
        : null,
    })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to check export job', err) }
})
