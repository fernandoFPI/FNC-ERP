import { Router, type IRouter } from 'express'
import { registerAttachmentRoutes } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { requirePermission } from '@fnc-erp/permissions'

export const journalAttachmentsRouter: IRouter = Router()
journalAttachmentsRouter.use(requirePermission('finance.gl.view', 'view'))
registerAttachmentRoutes(
  journalAttachmentsRouter,
  {
    entityType: 'journal_entry',
    verifyEntitySql: 'SELECT id FROM journal_entries WHERE id=$1 AND company_id=$2',
  },
  logAudit,
)
