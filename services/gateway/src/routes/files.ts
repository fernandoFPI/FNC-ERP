import express, { Router, type IRouter } from 'express'
import { z } from 'zod'
import { requireAuth } from '@fnc-erp/auth'
import { query, withTransaction } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { env } from '@fnc-erp/config'
import {
  generateUploadUrl,
  generateDownloadUrl,
  deleteFile,
  validateFile,
  uploadBuffer,
} from '@fnc-erp/storage'

export const filesRouter: IRouter = Router()

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  category: z.enum(['contract', 'identity', 'attachment', 'report', 'po_receipt_photo', 'po_return_damage_photo']),
})

// ── POST /api/v1/files/upload-url ─────────────────────────────
filesRouter.post('/upload-url', requireAuth(), async (req, res) => {
  const parsed = uploadUrlSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } })
    return
  }
  const { filename, mimeType, sizeBytes, category } = parsed.data

  const validation = validateFile(filename, mimeType, sizeBytes, category, env.MAX_FILE_SIZE_BYTES)
  if (!validation.valid) {
    res.status(400).json({ success: false, error: { code: 'INVALID_FILE', message: validation.reason } })
    return
  }

  try {
    const upload = await generateUploadUrl({
      filename, mimeType, sizeBytes, category,
      companyId: req.auth!.companyId,
      uploadedBy: req.auth!.userId,
    })

    await query(
      `INSERT INTO files (id, company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
      [upload.fileId, req.auth!.companyId, req.auth!.userId,
       upload.fileKey, filename, mimeType, sizeBytes, category],
    )

    res.json({
      success: true,
      data: {
        uploadUrl: upload.uploadUrl,
        fileId: upload.fileId,
        fileKey: upload.fileKey,
        expiresInSeconds: upload.expiresInSeconds,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate upload URL' } })
  }
})

// ── POST /api/v1/files/confirm ─────────────────────────────────
filesRouter.post('/confirm', requireAuth(), async (req, res) => {
  const fileId = (req.body as { fileId?: string }).fileId
  if (!fileId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'fileId is required' } })
    return
  }

  const file = await query<{
    id: string; status: string; original_filename: string; category: string; size_bytes: string
  }>('SELECT * FROM files WHERE id=$1 AND company_id=$2', [fileId, req.auth!.companyId])

  if (!file.rows[0]) {
    res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found' } })
    return
  }
  if (file.rows[0].status !== 'pending') {
    res.status(400).json({ success: false, error: { code: 'ALREADY_CONFIRMED', message: 'File already confirmed' } })
    return
  }

  try {
    await query(`UPDATE files SET status='uploaded', uploaded_at=NOW() WHERE id=$1`, [fileId])

    await logAudit({
      userId: req.auth!.userId,
      companyId: req.auth!.companyId,
      action: 'CREATE',
      tableName: 'files',
      recordId: fileId,
      newValues: {
        filename: file.rows[0].original_filename,
        category: file.rows[0].category,
        sizeBytes: file.rows[0].size_bytes,
      },
    })

    res.json({
      success: true,
      data: {
        fileId,
        filename: file.rows[0].original_filename,
        category: file.rows[0].category,
        sizeBytes: parseInt(file.rows[0].size_bytes),
        uploadedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to confirm upload' } })
  }
})

// ── GET /api/v1/files/:fileId/download-url ─────────────────────
filesRouter.get('/:fileId/download-url', requireAuth(), async (req, res) => {
  const fileId = req.params['fileId']!

  const file = await query<{
    id: string; file_key: string; original_filename: string; mime_type: string; size_bytes: string; status: string
  }>(
    `SELECT * FROM files WHERE id=$1 AND company_id=$2 AND status != 'deleted'`,
    [fileId, req.auth!.companyId],
  )

  if (!file.rows[0]) {
    res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found or access denied' } })
    return
  }

  try {
    const { downloadUrl, expiresInSeconds } = await generateDownloadUrl(
      file.rows[0].file_key,
      file.rows[0].original_filename,
    )

    res.json({
      success: true,
      data: {
        downloadUrl,
        expiresInSeconds,
        filename: file.rows[0].original_filename,
        mimeType: file.rows[0].mime_type,
        sizeBytes: parseInt(file.rows[0].size_bytes),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate download URL' } })
  }
})

// ── POST /api/v1/files/:fileId/content ────────────────────────
// Proxy upload: browser posts raw binary; gateway streams to B2 server-side.
// Avoids browser-to-B2 CORS issues entirely. Accepts raw body up to 50 MB.
filesRouter.post(
  '/:fileId/content',
  requireAuth(),
  express.raw({ type: '*/*', limit: '50mb' }),
  async (req, res) => {
    const fileId = req.params['fileId']!
    const file = await query<{ id: string; file_key: string; mime_type: string; status: string }>(
      `SELECT id, file_key, mime_type, status FROM files WHERE id=$1 AND company_id=$2`,
      [fileId, req.auth!.companyId],
    )
    if (!file.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found' } })
      return
    }
    if (file.rows[0].status !== 'pending') {
      res.status(400).json({ success: false, error: { code: 'ALREADY_UPLOADED', message: 'File already uploaded' } })
      return
    }
    try {
      const buffer = req.body as Buffer
      await uploadBuffer(buffer, file.rows[0].file_key, file.rows[0].mime_type)
      await query(`UPDATE files SET status='uploaded', uploaded_at=NOW() WHERE id=$1`, [fileId])
      res.json({ success: true, data: { fileId } })
    } catch (err) {
      res.status(500).json({ success: false, error: { code: 'UPLOAD_FAILED', message: (err as Error).message } })
    }
  },
)

// ── GET /api/v1/files/attachments?entityType=X&entityId=Y ──────
filesRouter.get('/attachments', requireAuth(), async (req, res) => {
  const { entityType, entityId } = req.query as { entityType?: string; entityId?: string }
  if (!entityType || !entityId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'entityType and entityId are required' } })
    return
  }
  try {
    const rows = await query(
      `SELECT da.id, da.file_id, f.original_filename, f.mime_type, f.size_bytes, f.category,
              da.label, da.is_primary, da.created_at
       FROM document_attachments da
       JOIN files f ON f.id = da.file_id
       WHERE da.entity_type=$1 AND da.entity_id=$2 AND f.company_id=$3 AND f.status != 'deleted'
       ORDER BY da.created_at`,
      [entityType, entityId, req.auth!.companyId],
    )
    // Generate short-lived download URLs for each file
    const withUrls = await Promise.all(rows.rows.map(async (row) => {
      const r = row as { file_id: string; [k: string]: unknown }
      const file = await query<{ file_key: string }>(
        `SELECT file_key FROM files WHERE id=$1`, [r.file_id],
      )
      try {
        const { downloadUrl } = await generateDownloadUrl(file.rows[0]!.file_key, String(r['original_filename']))
        return { ...r, download_url: downloadUrl }
      } catch {
        return { ...r, download_url: null }
      }
    }))
    res.json({ success: true, data: withUrls })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list attachments' } })
  }
})

// ── POST /api/v1/files/attach ──────────────────────────────────
filesRouter.post('/attach', requireAuth(), async (req, res) => {
  const { fileId, entityType, entityId, label, description } = req.body as {
    fileId?: string; entityType?: string; entityId?: string; label?: string; description?: string
  }
  if (!fileId || !entityType || !entityId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'fileId, entityType, and entityId are required' } })
    return
  }
  const file = await query(
    `SELECT id FROM files WHERE id=$1 AND company_id=$2 AND status='uploaded'`,
    [fileId, req.auth!.companyId],
  )
  if (!file.rows[0]) {
    res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found or not yet uploaded' } })
    return
  }
  try {
    await query(
      `INSERT INTO document_attachments (file_id, entity_type, entity_id, label, description, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (file_id, entity_type, entity_id) DO NOTHING`,
      [fileId, entityType, entityId, label ?? null, description ?? null, req.auth!.userId],
    )
    await query(`UPDATE files SET status='attached' WHERE id=$1`, [fileId])
    // Log to project activity when attaching to an RFQ phase
    if (entityType === 'rfq_phase') {
      const phase = await query<{ project_id: string; phase_type: string }>(
        `SELECT project_id, phase_type FROM rfq_phases WHERE id=$1`, [entityId],
      )
      if (phase.rows[0]) {
        const phaseLabel = ({ engineering: 'Engineering', pricing: 'Pricing', executing: 'Executing' })[phase.rows[0].phase_type] ?? phase.rows[0].phase_type
        await query(
          `INSERT INTO project_activity_log (project_id, actor_id, event_type, summary) VALUES ($1,$2,$3,$4)`,
          [phase.rows[0].project_id, req.auth!.userId, 'rfq_phase_file', `File uploaded to ${phaseLabel} phase: "${label ?? fileId}"`],
        )
      }
    }
    res.json({ success: true, data: { message: 'File attached' } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to attach file' } })
  }
})

// ── DELETE /api/v1/files/attachments/:attachmentId ────────────
// Detaches the attachment record and, if the file has no other
// attachments, removes it from storage and marks it deleted.
filesRouter.delete('/attachments/:attachmentId', requireAuth(), async (req, res) => {
  const attachmentId = req.params['attachmentId']!
  const attachment = await query<{ id: string; file_id: string; file_key: string; entity_type: string; entity_id: string; label: string | null }>(
    `SELECT da.id, da.file_id, f.file_key, da.entity_type, da.entity_id, da.label
     FROM document_attachments da
     JOIN files f ON f.id = da.file_id
     WHERE da.id=$1 AND f.company_id=$2`,
    [attachmentId, req.auth!.companyId],
  )
  if (!attachment.rows[0]) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Attachment not found' } })
    return
  }
  const { file_id: fileId, file_key: fileKey, entity_type: entityType, entity_id: entityId, label } = attachment.rows[0]
  try {
    await query('DELETE FROM document_attachments WHERE id=$1', [attachmentId])
    const remaining = await query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM document_attachments WHERE file_id=$1', [fileId],
    )
    if (parseInt(remaining.rows[0]?.count ?? '0') === 0) {
      try { await deleteFile(fileKey) } catch { /* storage delete best-effort */ }
      await query(`UPDATE files SET status='deleted', deleted_at=NOW() WHERE id=$1`, [fileId])
    }
    // Log to project activity when removing from an RFQ phase
    if (entityType === 'rfq_phase') {
      const phase = await query<{ project_id: string; phase_type: string }>(
        `SELECT project_id, phase_type FROM rfq_phases WHERE id=$1`, [entityId],
      )
      if (phase.rows[0]) {
        const phaseLabel = ({ engineering: 'Engineering', pricing: 'Pricing', executing: 'Executing' })[phase.rows[0].phase_type] ?? phase.rows[0].phase_type
        await query(
          `INSERT INTO project_activity_log (project_id, actor_id, event_type, summary) VALUES ($1,$2,$3,$4)`,
          [phase.rows[0].project_id, req.auth!.userId, 'rfq_phase_file_delete', `File removed from ${phaseLabel} phase: "${label ?? fileId}"`],
        )
      }
    }
    res.json({ success: true, data: { message: 'Attachment removed' } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete attachment' } })
  }
})

// ── DELETE /api/v1/files/:fileId ───────────────────────────────
filesRouter.delete('/:fileId', requireAuth(), async (req, res) => {
  const fileId = req.params['fileId']!

  const file = await query<{ id: string; file_key: string; original_filename: string; status: string }>(
    `SELECT * FROM files WHERE id=$1 AND company_id=$2`,
    [fileId, req.auth!.companyId],
  )

  if (!file.rows[0]) {
    res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found' } })
    return
  }

  const attachments = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM document_attachments WHERE file_id=$1`, [fileId],
  )
  if (parseInt(attachments.rows[0]?.count ?? '0') > 0) {
    res.status(400).json({
      success: false,
      error: { code: 'FILE_IN_USE', message: 'Cannot delete a file that is attached to records. Remove attachments first.' },
    })
    return
  }

  try {
    await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
      async (client) => {
        await deleteFile(file.rows[0]!.file_key)
        await client.query(`UPDATE files SET status='deleted', deleted_at=NOW() WHERE id=$1`, [fileId])
        await logAudit({
          userId: req.auth!.userId,
          companyId: req.auth!.companyId,
          action: 'DELETE',
          tableName: 'files',
          recordId: fileId,
          oldValues: { filename: file.rows[0]!.original_filename },
          client,
        })
      },
    )
    res.json({ success: true, data: { message: 'File deleted' } })
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete file' } })
  }
})
