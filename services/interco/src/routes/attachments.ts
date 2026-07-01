import { Router, type IRouter } from 'express'
import { registerAttachmentRoutes } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { requirePermission } from '@fnc-erp/permissions'

export const intercoAttachmentsRouter: IRouter = Router()
intercoAttachmentsRouter.use(requirePermission('interco.transactions.view', 'view'))
registerAttachmentRoutes(
  intercoAttachmentsRouter,
  {
    entityType: 'interco_transaction',
    verifyEntitySql: `SELECT id FROM interco_transactions
                      WHERE id=$1 AND (from_company_id=$2 OR to_company_id=$2)`,
  },
  logAudit,
)
