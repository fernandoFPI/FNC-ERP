import { Router, type IRouter } from 'express'
import { registerAttachmentRoutes } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { requirePermission } from '@fnc-erp/permissions'

export const poAttachmentsRouter: IRouter = Router()
poAttachmentsRouter.use(requirePermission('procurement.po.view', 'view'))
registerAttachmentRoutes(
  poAttachmentsRouter,
  {
    entityType: 'purchase_order',
    verifyEntitySql: 'SELECT id FROM purchase_orders WHERE id=$1 AND company_id=$2',
  },
  logAudit,
)

export const poReceiptAttachmentsRouter: IRouter = Router()
poReceiptAttachmentsRouter.use(requirePermission('procurement.po.view', 'view'))
registerAttachmentRoutes(
  poReceiptAttachmentsRouter,
  {
    entityType: 'po_receipt',
    verifyEntitySql: `SELECT por.id FROM po_receipts por
                      JOIN purchase_orders po ON po.id=por.po_id
                      WHERE por.id=$1 AND po.company_id=$2`,
  },
  logAudit,
)

export const vendorAttachmentsRouter: IRouter = Router()
vendorAttachmentsRouter.use(requirePermission('procurement.vendors.view', 'view'))
registerAttachmentRoutes(
  vendorAttachmentsRouter,
  {
    entityType: 'vendor',
    verifyEntitySql: 'SELECT id FROM vendors WHERE id=$1 AND company_id=$2',
  },
  logAudit,
)
