import { Router, type IRouter } from 'express'
import { registerAttachmentRoutes } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { requirePermission } from '@fnc-erp/permissions'

export const projectAttachmentsRouter: IRouter = Router()
projectAttachmentsRouter.use(requirePermission('projects.view', 'view'))
registerAttachmentRoutes(
  projectAttachmentsRouter,
  {
    entityType: 'project',
    verifyEntitySql: 'SELECT id FROM projects WHERE id=$1 AND company_id=$2',
  },
  logAudit,
)

export const contractAttachmentsRouter: IRouter = Router()
contractAttachmentsRouter.use(requirePermission('projects.view', 'view'))
registerAttachmentRoutes(
  contractAttachmentsRouter,
  {
    entityType: 'project_contract',
    verifyEntitySql: 'SELECT id FROM project_contracts WHERE id=$1 AND company_id=$2',
  },
  logAudit,
)

export const invoiceAttachmentsRouter: IRouter = Router()
invoiceAttachmentsRouter.use(requirePermission('projects.invoices.view', 'view'))
registerAttachmentRoutes(
  invoiceAttachmentsRouter,
  {
    entityType: 'project_invoice',
    verifyEntitySql: 'SELECT id FROM project_invoices WHERE id=$1 AND company_id=$2',
  },
  logAudit,
)
