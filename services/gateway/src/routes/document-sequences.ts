import { Router, type IRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '@fnc-erp/auth'
import { listDocumentSequences, upsertDocumentSequence, DOC_TYPES } from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'
import type { Request, Response } from 'express'

const log = logger.child({ module: 'document-sequences' })

export const documentSequencesRouter: IRouter = Router()

const requireAdmin = [requireAuth(), requireRole('system_admin')]

const upsertSchema = z.object({
  prefix: z.string().max(20),
  next_number: z.number().int().min(1),
  pad_length: z.number().int().min(1).max(10),
  year_in_number: z.boolean(),
  separator: z.string().max(5),
})

// GET /api/v1/admin/document-sequences
// Returns all sequences for the caller's company, with defaults for unconfigured types
documentSequencesRouter.get('/', ...requireAdmin, async (req: Request, res: Response) => {
  try {
    const companyId = req.auth!.companyId
    const rows = await listDocumentSequences(companyId)
    const rowMap = new Map(rows.map((r) => [r.doc_type, r]))

    const sequences = DOC_TYPES.map((dt) => {
      const row = rowMap.get(dt.key)
      return {
        doc_type: dt.key,
        label: dt.label,
        prefix: row?.prefix ?? dt.defaultPrefix,
        next_number: row?.next_number ?? 1,
        pad_length: row?.pad_length ?? 4,
        year_in_number: row?.year_in_number ?? false,
        separator: row?.separator ?? '-',
        configured: !!row,
        updated_at: row?.updated_at ?? null,
        preview: buildPreview(
          row?.prefix ?? dt.defaultPrefix,
          row?.next_number ?? 1,
          row?.pad_length ?? 4,
          row?.year_in_number ?? false,
          row?.separator ?? '-',
        ),
      }
    })

    res.json({ sequences })
  } catch (err) {
    log.error({ err }, 'document-sequences GET failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

// PUT /api/v1/admin/document-sequences/:docType
documentSequencesRouter.put('/:docType', ...requireAdmin, async (req: Request, res: Response) => {
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues })
    return
  }

  const docType = req.params.docType
  if (!DOC_TYPES.some((dt) => dt.key === docType)) {
    res.status(400).json({ error: 'UNKNOWN_DOC_TYPE' })
    return
  }

  try {
    const row = await upsertDocumentSequence(req.auth!.companyId, docType, parsed.data)
    res.json({
      ...row,
      preview: buildPreview(
        row.prefix,
        row.next_number,
        row.pad_length,
        row.year_in_number,
        row.separator,
      ),
    })
  } catch (err) {
    log.error({ err }, 'document-sequences PUT failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

function buildPreview(
  prefix: string,
  nextNumber: number,
  padLength: number,
  yearInNumber: boolean,
  separator: string,
): string {
  const num = String(nextNumber).padStart(padLength, '0')
  if (yearInNumber) {
    const yr = new Date().getFullYear()
    return `${prefix}${separator}${yr}${separator}${num}`
  }
  return `${prefix}${separator}${num}`
}
