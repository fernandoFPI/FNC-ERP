import { Router, type Request, type Response, type IRouter } from 'express'
import { query, withTransaction } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { getAttachments, createAttachment, removeAttachment } from '@fnc-erp/db'
import { requirePermission } from '@fnc-erp/permissions'

export const employeeAttachmentsRouter: IRouter = Router()

interface Employee {
  id: string
  user_id: string | null
  department_id: string | null
}

async function getEmployee(id: string, companyId: string): Promise<Employee | null> {
  const result = await query<Employee>(
    `SELECT id, user_id, department_id FROM employees WHERE id=$1 AND company_id=$2`,
    [id, companyId],
  )
  return result.rows[0] ?? null
}

async function checkEmployeeDocumentAccess(
  userId: string,
  companyId: string,
  role: string,
  module: string,
  employee: Employee,
): Promise<boolean> {
  if (role === 'system_admin' || role === 'company_admin') return true
  if (module === 'hr' && (role === 'module_admin' || role === 'admin')) return true
  if (employee.user_id === userId) return true

  if (employee.department_id) {
    const dept = await query<{ manager_id: string | null }>(
      `SELECT manager_id FROM departments WHERE id=$1`, [employee.department_id],
    )
    const managerId = dept.rows[0]?.manager_id
    if (managerId) {
      const mgr = await query<{ user_id: string | null }>(
        `SELECT user_id FROM employees WHERE id=$1`, [managerId],
      )
      if (mgr.rows[0]?.user_id === userId) return true
    }
  }
  return false
}

// GET /hr/employees/:id/attachments
employeeAttachmentsRouter.get('/:id/attachments', requirePermission('hr.employees.view', 'view'), async (req: Request, res: Response) => {
  const companyId = req.auth!.companyId
  const employee = await getEmployee(req.params['id']!, companyId)
  if (!employee) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } })
    return
  }

  const canAccess = await checkEmployeeDocumentAccess(
    req.auth!.userId, companyId, req.auth!.role, req.auth!.module, employee,
  )
  if (!canAccess) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to view this employee\'s documents' } })
    return
  }

  const result = await getAttachments('employee', req.params['id']!)
  res.json({ success: true, data: result.rows })
})

// POST /hr/employees/:id/attachments
employeeAttachmentsRouter.post('/:id/attachments', requirePermission('hr.employees.edit', 'edit'), async (req: Request, res: Response) => {
  const companyId = req.auth!.companyId
  const userId = req.auth!.userId
  const entityId = req.params['id']!
  const body = req.body as { fileId?: string; label?: string; isPrimary?: boolean }

  if (!body.fileId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'fileId is required' } })
    return
  }

  const employee = await getEmployee(entityId, companyId)
  if (!employee) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } })
    return
  }

  const canAccess = await checkEmployeeDocumentAccess(
    userId, companyId, req.auth!.role, req.auth!.module, employee,
  )
  if (!canAccess) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to attach documents to this employee' } })
    return
  }

  const file = await query(`SELECT id FROM files WHERE id=$1 AND company_id=$2 AND status='uploaded'`, [body.fileId, companyId])
  if (!file.rows[0]) {
    res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found or not yet confirmed as uploaded' } })
    return
  }

  try {
    await withTransaction({ companyId, userId, role: req.auth!.role }, async (client) => {
      await createAttachment(client, {
        entityType: 'employee', entityId, fileId: body.fileId!,
        label: body.label ?? null, isPrimary: body.isPrimary ?? false, uploadedBy: userId,
      })
      await logAudit({
        userId, companyId, action: 'CREATE', tableName: 'document_attachments',
        recordId: entityId, newValues: { fileId: body.fileId, entityType: 'employee', label: body.label }, client,
      })
    })
    res.status(201).json({ success: true, data: { message: 'File attached' } })
  } catch (err) {
    res.status(409).json({ success: false, error: { code: 'ATTACHMENT_ERROR', message: 'Failed to attach file' } })
  }
})

// DELETE /hr/employees/:id/attachments/:attachmentId
employeeAttachmentsRouter.delete('/:id/attachments/:attachmentId', requirePermission('hr.employees.edit', 'edit'), async (req: Request, res: Response) => {
  const companyId = req.auth!.companyId
  const userId = req.auth!.userId
  const entityId = req.params['id']!
  const attachmentId = req.params['attachmentId']!

  const employee = await getEmployee(entityId, companyId)
  if (!employee) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } })
    return
  }

  const canAccess = await checkEmployeeDocumentAccess(
    userId, companyId, req.auth!.role, req.auth!.module, employee,
  )
  if (!canAccess) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to remove documents from this employee' } })
    return
  }

  try {
    let removed: { fileId: string; filename: string } | null = null
    await withTransaction({ companyId, userId, role: req.auth!.role }, async (client) => {
      removed = await removeAttachment(client, attachmentId, 'employee', entityId)
      if (removed) {
        await logAudit({
          userId, companyId, action: 'DELETE', tableName: 'document_attachments',
          recordId: entityId, oldValues: { fileId: removed.fileId, filename: removed.filename }, client,
        })
      }
    })
    if (!removed) {
      res.status(404).json({ success: false, error: { code: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not found' } })
      return
    }
    res.json({ success: true, data: { message: 'Attachment removed' } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove attachment' } })
  }
})
