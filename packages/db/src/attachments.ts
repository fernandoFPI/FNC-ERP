import type { PoolClient } from './client.js'
import { pool, query } from './client.js'
import { withTransaction } from './transaction.js'
import type { Router, Request, Response } from 'express'

// Local type — mirrors the auth context injected by @fnc-erp/auth middleware
interface AuthRequest extends Request {
  auth?: { userId: string; companyId: string; role: string; module: string; sessionId: string }
}

export type EntityType =
  | 'purchase_order'
  | 'po_receipt'
  | 'project_contract'
  | 'project_invoice'
  | 'project'
  | 'vendor'
  | 'employee'
  | 'payroll_run'
  | 'manufacturing_order'
  | 'rental_contract'
  | 'interco_transaction'
  | 'journal_entry'

export interface AttachmentRouteOptions {
  entityType: EntityType
  /** SQL to verify entity belongs to company: SELECT id FROM {table} WHERE id=$1 AND company_id=$2 */
  verifyEntitySql: string
}

// ── Core attachment query helpers ──────────────────────────────

export async function getAttachments(entityType: EntityType, entityId: string) {
  return query(
    `SELECT
       da.id, da.label, da.is_primary, da.created_at,
       f.id AS file_id, f.original_filename, f.mime_type,
       f.size_bytes, f.category, f.uploaded_at,
       u.email AS uploaded_by_email
     FROM document_attachments da
     JOIN files f ON f.id = da.file_id
     JOIN users u ON u.id = da.uploaded_by
     WHERE da.entity_type = $1
       AND da.entity_id = $2
       AND f.status != 'deleted'
     ORDER BY da.is_primary DESC, da.created_at ASC`,
    [entityType, entityId],
  )
}

export async function createAttachment(
  client: PoolClient,
  opts: {
    entityType: EntityType
    entityId: string
    fileId: string
    label: string | null
    isPrimary: boolean
    uploadedBy: string
  },
): Promise<void> {
  if (opts.isPrimary) {
    await client.query(
      `UPDATE document_attachments SET is_primary=false
       WHERE entity_type=$1 AND entity_id=$2`,
      [opts.entityType, opts.entityId],
    )
  }

  await client.query(
    `INSERT INTO document_attachments (file_id, entity_type, entity_id, label, is_primary, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [opts.fileId, opts.entityType, opts.entityId, opts.label, opts.isPrimary, opts.uploadedBy],
  )

  await client.query(`UPDATE files SET status='attached' WHERE id=$1`, [opts.fileId])
}

export async function removeAttachment(
  client: PoolClient,
  attachmentId: string,
  entityType: EntityType,
  entityId: string,
): Promise<{ fileId: string; filename: string } | null> {
  const result = await client.query<{ id: string; file_id: string; original_filename: string }>(
    `SELECT da.id, da.file_id, f.original_filename
     FROM document_attachments da
     JOIN files f ON f.id = da.file_id
     WHERE da.id=$1 AND da.entity_type=$2 AND da.entity_id=$3`,
    [attachmentId, entityType, entityId],
  )
  if (!result.rows[0]) return null

  await client.query(`DELETE FROM document_attachments WHERE id=$1`, [attachmentId])

  const remaining = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM document_attachments WHERE file_id=$1`,
    [result.rows[0].file_id],
  )
  if (parseInt(remaining.rows[0]?.count ?? '0') === 0) {
    await client.query(`UPDATE files SET status='uploaded' WHERE id=$1`, [result.rows[0].file_id])
  }

  return { fileId: result.rows[0].file_id, filename: result.rows[0].original_filename }
}

// ── Express route factory ──────────────────────────────────────
// Registers GET /:id/attachments, POST /:id/attachments, DELETE /:id/attachments/:attachmentId
// on the provided router.

export function registerAttachmentRoutes(
  router: Router,
  opts: AttachmentRouteOptions,
  logAuditFn: (params: {
    userId: string
    companyId: string
    action: string
    tableName: string
    recordId: string
    newValues?: Record<string, unknown>
    oldValues?: Record<string, unknown>
    client?: PoolClient
  }) => Promise<void>,
): void {
  const { entityType, verifyEntitySql } = opts

  // GET /:id/attachments
  router.get('/:id/attachments', async (req: AuthRequest, res: Response) => {
    try {
      const result = await getAttachments(entityType, req.params['id']!)
      res.json({ success: true, data: result.rows })
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch attachments' },
      })
    }
  })

  // POST /:id/attachments
  router.post('/:id/attachments', async (req: AuthRequest, res: Response) => {
    const body = req.body as { fileId?: string; label?: string; isPrimary?: boolean }
    const { fileId, label, isPrimary } = body

    if (!fileId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'fileId is required' },
      })
      return
    }

    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const entityId = req.params['id']!

    // Verify entity belongs to company
    const entity = await query(verifyEntitySql, [entityId, companyId])
    if (!entity.rows[0]) {
      res
        .status(404)
        .json({ success: false, error: { code: 'NOT_FOUND', message: `${entityType} not found` } })
      return
    }

    // Verify file belongs to company and is uploaded
    const file = await query(
      `SELECT id FROM files WHERE id=$1 AND company_id=$2 AND status='uploaded'`,
      [fileId, companyId],
    )
    if (!file.rows[0]) {
      res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found or not yet confirmed as uploaded',
        },
      })
      return
    }

    try {
      await withTransaction({ companyId, userId, role: req.auth!.role }, async (client) => {
        await createAttachment(client, {
          entityType,
          entityId,
          fileId,
          label: label ?? null,
          isPrimary: isPrimary ?? false,
          uploadedBy: userId,
        })
        await logAuditFn({
          userId,
          companyId,
          action: 'CREATE',
          tableName: 'document_attachments',
          recordId: entityId,
          newValues: { fileId, entityType, label },
          client,
        })
      })
      res.status(201).json({ success: true, data: { message: 'File attached' } })
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('unique')
          ? 'File already attached to this record'
          : 'Failed to attach file'
      res.status(409).json({ success: false, error: { code: 'ATTACHMENT_ERROR', message: msg } })
    }
  })

  // DELETE /:id/attachments/:attachmentId
  router.delete('/:id/attachments/:attachmentId', async (req: AuthRequest, res: Response) => {
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const entityId = req.params['id']!
    const attachmentId = req.params['attachmentId']!

    try {
      let removed: { fileId: string; filename: string } | null = null

      await withTransaction({ companyId, userId, role: req.auth!.role }, async (client) => {
        removed = await removeAttachment(client, attachmentId, entityType, entityId)
        if (!removed) {
          return // will 404 below
        }
        await logAuditFn({
          userId,
          companyId,
          action: 'DELETE',
          tableName: 'document_attachments',
          recordId: entityId,
          oldValues: { fileId: removed.fileId, filename: removed.filename },
          client,
        })
      })

      if (!removed) {
        res.status(404).json({
          success: false,
          error: { code: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not found' },
        })
        return
      }

      res.json({ success: true, data: { message: 'Attachment removed' } })
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to remove attachment' },
      })
    }
  })
}
