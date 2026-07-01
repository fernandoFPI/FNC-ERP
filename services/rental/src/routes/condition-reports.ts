import { Router } from 'express'
import type { IRouter, Request, Response } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const conditionReportsRouter: IRouter = Router({ mergeParams: true })

const ChecklistItemSchema = z.object({
  item: z.string(),
  status: z.enum(['ok', 'issue', 'na']),
  notes: z.string().optional(),
})

const ReportSchema = z.object({
  project_id: z.string().uuid().optional(),
  overall_condition: z.enum(['good', 'fair', 'poor', 'critical']),
  checklist: z.array(ChecklistItemSchema).default([]),
  issues_found: z.string().max(5000).optional(),
  gps_lat: z.number().min(-90).max(90).optional(),
  gps_lng: z.number().min(-180).max(180).optional(),
  photo_file_ids: z.array(z.string().uuid()).default([]),
  reported_via: z.string().default('mobile'),
})

const CloseSchema = z.object({
  action_taken: z.string().min(10).max(5000),
  maintenance_record_id: z.string().uuid().optional(),
})

// GET /rental/assets/:id/condition-reports
conditionReportsRouter.get('/', requirePermission('rental.assets.view', 'view'), async (req, res) => {
  try {
    const status = req.query['status'] as string | undefined
    const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1'))
    const limit = Math.min(100, parseInt((req.query['limit'] as string) ?? '20'))
    const offset = (page - 1) * limit

    const params: unknown[] = [(req.params as Record<string, string>)['id']!]
    const conditions: string[] = []
    let idx = 2
    if (status) { conditions.push(`ecr.status = $${idx++}`); params.push(status) }
    params.push(limit, offset)

    const where = conditions.length ? `AND ${conditions.join(' AND ')}` : ''
    const reports = await query(
      `SELECT ecr.*,
              u.email  AS reported_by_email,
              rv.email AS reviewed_by_email,
              p.name   AS project_name
       FROM equipment_condition_reports ecr
       JOIN users u ON u.id = ecr.reported_by
       LEFT JOIN users rv ON rv.id = ecr.reviewed_by
       LEFT JOIN projects p ON p.id = ecr.project_id
       WHERE ecr.asset_id = $1 ${where}
       ORDER BY ecr.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params,
    )
    sendOk(res, reports.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch condition reports', err)
  }
})

// POST /rental/assets/:id/condition-reports
conditionReportsRouter.post('/', requirePermission('rental.assets.edit', 'edit'), async (req, res) => {
  const parsed = ReportSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }
  const d = parsed.data

  try {
    const client = await pool.connect()
    let report: Record<string, unknown>
    try {
      await client.query('BEGIN')

      const result = await client.query(
        `INSERT INTO equipment_condition_reports
           (asset_id, project_id, reported_by, reported_via,
            overall_condition, checklist, issues_found,
            gps_lat, gps_lng, photo_file_ids)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)
         RETURNING *`,
        [(req.params as Record<string, string>)['id']!, d.project_id ?? null,
         req.auth!.userId, d.reported_via, d.overall_condition,
         JSON.stringify(d.checklist), d.issues_found ?? null,
         d.gps_lat ?? null, d.gps_lng ?? null,
         JSON.stringify(d.photo_file_ids)],
      )
      report = result.rows[0] as Record<string, unknown>

      // Alert rental managers for poor/critical condition
      if (d.overall_condition === 'critical' || d.overall_condition === 'poor') {
        await client.query(
          `INSERT INTO service_outbox (service, event_type, payload)
           VALUES ('notifications','ASSET_CONDITION_ALERT',$1::jsonb)`,
          [JSON.stringify({
            assetId: (req.params as Record<string, string>)['id']!,
            reportId: report['id'],
            condition: d.overall_condition,
            issues: d.issues_found,
            reportedBy: req.auth!.userId,
            companyId: req.auth!.companyId,
          })],
        )
      }

      await logAudit({
        userId: req.auth!.userId,
        companyId: req.auth!.companyId,
        action: 'CONDITION_REPORT_SUBMITTED',
        tableName: 'equipment_condition_reports',
        recordId: report['id'] as string,
        newValues: { overall_condition: d.overall_condition, project_id: d.project_id },
        client,
      })

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    sendOk(res, report, 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit condition report', err)
  }
})

// POST /rental/assets/:id/condition-reports/:reportId/acknowledge
conditionReportsRouter.post('/:reportId/acknowledge', requirePermission('rental.assets.edit', 'edit'), async (req, res) => {
  try {
    await query(
      `UPDATE equipment_condition_reports
       SET status = 'acknowledged', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND asset_id = $3`,
      [req.auth!.userId, req.params['reportId'], (req.params as Record<string, string>)['id']!],
    )
    sendOk(res, { message: 'Report acknowledged' })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to acknowledge report', err)
  }
})

// POST /rental/assets/:id/condition-reports/:reportId/close
conditionReportsRouter.post('/:reportId/close', requirePermission('rental.assets.edit', 'edit'), async (req, res) => {
  const parsed = CloseSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'ACTION_REQUIRED', 'action_taken description required (minimum 10 characters)', parsed.error.flatten())
    return
  }
  const d = parsed.data

  try {
    await query(
      `UPDATE equipment_condition_reports
       SET status = 'closed',
           reviewed_by = $1, reviewed_at = NOW(),
           action_taken = $2, maintenance_record_id = $3,
           updated_at = NOW()
       WHERE id = $4 AND asset_id = $5`,
      [req.auth!.userId, d.action_taken, d.maintenance_record_id ?? null,
       req.params['reportId'], (req.params as Record<string, string>)['id']!],
    )
    sendOk(res, { message: 'Condition report closed' })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to close report', err)
  }
})

// GET /rental/condition-reports/open â€” all open reports (registered at root level)
export async function getOpenConditionReports(req: Request, res: Response): Promise<void> {
  try {
    const reports = await query(
      `SELECT ecr.*,
              ea.name AS asset_name, ea.asset_number, ea.category,
              p.name  AS project_name,
              u.email AS reported_by_email
       FROM equipment_condition_reports ecr
       JOIN equipment_assets ea ON ea.id = ecr.asset_id
       LEFT JOIN projects p ON p.id = ecr.project_id
       JOIN users u ON u.id = ecr.reported_by
       WHERE ea.company_id = $1
         AND ecr.status IN ('open','acknowledged')
       ORDER BY
         CASE ecr.overall_condition
           WHEN 'critical' THEN 1
           WHEN 'poor'     THEN 2
           WHEN 'fair'     THEN 3
           WHEN 'good'     THEN 4
         END,
         ecr.created_at DESC`,
      [req.auth!.companyId],
    )
    sendOk(res, reports.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch open condition reports', err)
  }
}

