import { Router, type IRouter } from 'express'
import { registerAttachmentRoutes } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { requirePermission } from '@fnc-erp/permissions'

export const rentalContractAttachmentsRouter: IRouter = Router()
rentalContractAttachmentsRouter.use(requirePermission('rental.contracts.view', 'view'))
registerAttachmentRoutes(
  rentalContractAttachmentsRouter,
  {
    entityType: 'rental_contract',
    verifyEntitySql: 'SELECT id FROM rental_contracts WHERE id=$1 AND company_id=$2',
  },
  logAudit,
)
