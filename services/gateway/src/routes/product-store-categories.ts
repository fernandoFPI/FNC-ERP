import { Router, type IRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '@fnc-erp/auth'
import {
  pool,
  listProductStoreCategories,
  createProductStoreCategory,
  setProductStoreCategoryActive,
} from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'
import type { Request, Response } from 'express'

const log = logger.child({ module: 'product-store-categories' })

export const productStoreCategoriesRouter: IRouter = Router()

// Reading the list only requires being signed in — anyone creating a
// product needs it to populate the Store / Sub-category picker. Managing
// the list (adding/deactivating) is company_admin+ only.
const requireAdmin = [requireAuth(), requireRole('company_admin')]

// GET /api/v1/product-store-categories?includeInactive=true&companyId=...
// companyId lets the cross-company pending-catalog-item resolution flow
// (PendingCatalogItemsPage) show the TARGET company's own categories when
// it differs from the caller's — same access rule as everywhere else that
// flow reaches into another company (an active role there, or system_admin).
productStoreCategoriesRouter.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const requestedCompanyId =
      typeof req.query.companyId === 'string' && req.query.companyId ? req.query.companyId : null
    let companyId = req.auth!.companyId
    if (requestedCompanyId && requestedCompanyId !== req.auth!.companyId) {
      if (req.auth!.role !== 'system_admin') {
        const access = await pool.query(
          `SELECT 1 FROM user_company_roles WHERE user_id=$1 AND company_id=$2 AND is_active=true`,
          [req.auth!.userId, requestedCompanyId],
        )
        if (!access.rows[0]) {
          res.status(403).json({ error: 'FORBIDDEN', message: 'Not accessible to you' })
          return
        }
      }
      companyId = requestedCompanyId
    }
    const includeInactive = req.query.includeInactive === 'true'
    const categories = await listProductStoreCategories(companyId, includeInactive)
    res.json({ categories })
  } catch (err) {
    log.error({ err }, 'product-store-categories GET failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  sku_prefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,10}$/, 'Prefix must be 2-10 letters/digits, no spaces'),
})

// POST /api/v1/product-store-categories
productStoreCategoriesRouter.post('/', ...requireAdmin, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues })
    return
  }
  try {
    const row = await createProductStoreCategory(
      req.auth!.companyId,
      parsed.data.name,
      parsed.data.sku_prefix,
      req.auth!.userId,
    )
    res.json(row)
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      res
        .status(400)
        .json({ error: 'DUPLICATE', message: 'A category with that name or prefix already exists' })
      return
    }
    log.error({ err }, 'product-store-categories POST failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

const activeSchema = z.object({ is_active: z.boolean() })

// PATCH /api/v1/product-store-categories/:id/active
productStoreCategoriesRouter.patch(
  '/:id/active',
  ...requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = activeSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues })
      return
    }
    try {
      await setProductStoreCategoryActive(req.auth!.companyId, req.params.id!, parsed.data.is_active)
      res.json({ ok: true })
    } catch (err) {
      log.error({ err }, 'product-store-categories PATCH failed')
      res
        .status(400)
        .json({ error: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Failed' })
    }
  },
)
