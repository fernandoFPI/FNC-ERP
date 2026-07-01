import { Router, type IRouter } from 'express'
import { registerAttachmentRoutes } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { requirePermission } from '@fnc-erp/permissions'

export const moAttachmentsRouter: IRouter = Router()
moAttachmentsRouter.use(requirePermission('manufacturing.orders.view', 'view'))
registerAttachmentRoutes(
  moAttachmentsRouter,
  {
    entityType: 'manufacturing_order',
    verifyEntitySql: 'SELECT id FROM manufacturing_orders WHERE id=$1 AND company_id=$2',
  },
  logAudit,
)
