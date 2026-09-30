import { Router } from 'express'
import { getAuth } from '@fnc-erp/auth'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, firstRowOrThrow, asyncHandler } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const departmentsRouter: IRouter = Router()

const DeptSchema = z.object({
  name: z.string().min(1).max(200),
  parent_id: z.string().uuid().optional(),
  manager_id: z.string().uuid().optional(),
})

departmentsRouter.get('/', requirePermission('hr.departments.view', 'view'), asyncHandler(async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, e.first_name || ' ' || e.last_name AS manager_name
       FROM departments d
       LEFT JOIN employees e ON e.id = d.manager_id
       WHERE d.company_id = $1 AND d.is_active = TRUE ORDER BY d.name`,
      [getAuth(req).companyId],
    )
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch departments', err)
  }
}))

departmentsRouter.get(
  '/:id',
  requirePermission('hr.departments.view', 'view'),
  asyncHandler(async (req, res) => {
    try {
      const result = await query(
        `SELECT d.*, e.first_name || ' ' || e.last_name AS manager_name
       FROM departments d LEFT JOIN employees e ON e.id = d.manager_id
       WHERE d.id = $1 AND d.company_id = $2`,
        [req.params['id'], getAuth(req).companyId],
      )
      const row = result.rows[0]
      if (!row) {
        sendError(res, 404, 'NOT_FOUND', 'Department not found')
        return
      }
      sendOk(res, row)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch department', err)
    }
  }),
)

departmentsRouter.post('/', requirePermission('hr.departments.edit', 'edit'), asyncHandler(async (req, res) => {
  const parsed = DeptSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }
  try {
    const { name, parent_id, manager_id } = parsed.data
    const result = await query(
      `INSERT INTO departments (company_id, name, parent_id, manager_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [getAuth(req).companyId, name, parent_id ?? null, manager_id ?? null],
    )
    sendOk(res, firstRowOrThrow(result), 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create department', err)
  }
}))

departmentsRouter.put(
  '/:id',
  requirePermission('hr.departments.edit', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = DeptSchema.partial().safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }
    try {
      const existing = await query(`SELECT id FROM departments WHERE id = $1 AND company_id = $2`, [
        req.params['id'],
        getAuth(req).companyId,
      ])
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Department not found')
        return
      }
      const result = await query(
        `UPDATE departments SET name = COALESCE($1, name), parent_id = COALESCE($2, parent_id),
       manager_id = COALESCE($3, manager_id), updated_at = NOW()
       WHERE id = $4 AND company_id = $5 RETURNING *`,
        [
          parsed.data.name ?? null,
          parsed.data.parent_id ?? null,
          parsed.data.manager_id ?? null,
          req.params['id'],
          getAuth(req).companyId,
        ],
      )
      sendOk(res, firstRowOrThrow(result))
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update department', err)
    }
  }),
)

departmentsRouter.delete(
  '/:id',
  requirePermission('hr.departments.edit', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      const result = await query(
        `UPDATE departments SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 RETURNING id`,
        [req.params['id'], getAuth(req).companyId],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Department not found')
        return
      }
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete department', err)
    }
  }),
)
