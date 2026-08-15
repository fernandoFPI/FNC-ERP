import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, pool } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission, loadPermissions, meetsLevel } from '@fnc-erp/permissions'
import {
  userHasPosition,
  userIsDeptHead,
  userIsAssignedApprover,
  userIsOrganizer,
} from '../lib/po-authorization.js'
import {
  generatePONumber,
  transitionPO,
  transitionPOInClient,
  recalculatePOTotals,
  notifyPositionHolders,
  notifyDeptHeadsAndAdmins,
  notifyUser,
  notifyFinanceTeam,
} from '../lib/po-helpers.js'

export const ordersRouter: IRouter = Router()

// ── Validation schemas ──────────────────────────────────────────────────────

const POLineSchema = z.object({
  description: z.string().min(1).max(500),
  product_id: z.string().uuid().optional(),
  qty_ordered: z.number().positive(),
  unit_price: z.number().min(0).default(0),
  currency_code: z.string().length(3).default('IQD'),
  uom: z.string().max(20).default('unit'),
  account_id: z.string().uuid().optional(),
})

const CreatePOSchema = z.object({
  project_id: z.string().uuid().optional(),
  currency_code: z.string().length(3).default('IQD'),
  expected_delivery_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().optional(),
  lines: z.array(POLineSchema).optional(),
})

// ── Helper: check if isAdmin ────────────────────────────────────────────────

function isAdmin(role: string): boolean {
  return role === 'system_admin' || role === 'company_admin' || role === 'module_admin'
}

// ── Helper: finance-audit capability ────────────────────────────────────────
// Gates the finance_audit/invoiced stages (pass/fail audit, per-line audit
// status, completion). This is a system-wide finance capability, not a
// PO-specific position — 'finance' was never a real role in the
// user/module_admin/company_admin/system_admin hierarchy, so this check was
// previously unreachable by anyone but admins. finance.ap.approve is the
// existing permission that already governs finalizing vendor-invoice/AP work.
// Only system_admin/company_admin bypass — matches requirePermission's rule
// elsewhere; module_admin needs the permission explicitly granted like
// anyone else. Deliberately not isAdmin() above, which also includes
// module_admin and is for a different purpose (organizer/PO-authority checks).
async function hasFinanceApproval(userId: string, companyId: string, role: string): Promise<boolean> {
  if (role === 'system_admin' || role === 'company_admin') return true
  const perms = await loadPermissions(userId, companyId)
  return meetsLevel(perms['finance.ap.approve'], 'approve')
}

// ── Helper: handle transition errors ───────────────────────────────────────

function handleError(res: import('express').Response, err: unknown): void {
  const e = err as { statusCode?: number; code?: string; message?: string }
  if (e.statusCode) {
    sendError(res, e.statusCode, e.code ?? 'ERROR', e.message ?? 'Operation failed')
  } else {
    sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error', err)
  }
}

// ── GET /approval-queue/count ───────────────────────────────────────────────

ordersRouter.get(
  '/approval-queue/count',
  requirePermission('procurement.po.view', 'view'),
  async (req, res) => {
    try {
      const auth = req.auth!
      const empResult = await query(
        `SELECT id, department_id FROM employees WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
        [auth.userId, auth.companyId],
      )
      const employeeId: string | null = (empResult.rows[0]?.['id'] as string | null) ?? null
      const departmentId: string | null =
        (empResult.rows[0]?.['department_id'] as string | null) ?? null
      const hasFinance = await hasFinanceApproval(auth.userId, auth.companyId, auth.role)

      const result = await query(
        `SELECT COUNT(DISTINCT po.id) AS total
       FROM purchase_orders po
       WHERE po.company_id = $1
         AND po.status NOT IN ('deleted','completed','cancelled')
         AND (
           (po.organizer_id = $2 AND po.status IN ('draft','goods_received','rejected'))
           OR (po.status = 'inventory_check' AND EXISTS (SELECT 1 FROM po_position_assignments ppa WHERE ppa.employee_id=$3 AND ppa.position='store_keeper' AND ppa.is_active=true AND (ppa.project_id=po.project_id OR ppa.department_id=$4 OR (ppa.project_id IS NULL AND ppa.department_id IS NULL))))
           OR (po.status = 'store_pricing' AND EXISTS (SELECT 1 FROM po_position_assignments ppa WHERE ppa.employee_id=$3 AND ppa.position='store_pricing' AND ppa.is_active=true AND (ppa.project_id=po.project_id OR ppa.department_id=$4 OR (ppa.project_id IS NULL AND ppa.department_id IS NULL))))
           OR (po.status = 'market_pricing' AND EXISTS (SELECT 1 FROM po_position_assignments ppa WHERE ppa.employee_id=$3 AND ppa.position='procurement_officer' AND ppa.is_active=true AND (ppa.project_id=po.project_id OR ppa.department_id=$4 OR (ppa.project_id IS NULL AND ppa.department_id IS NULL))))
           OR (po.status = 'price_verification' AND EXISTS (SELECT 1 FROM po_position_assignments ppa WHERE ppa.employee_id=$3 AND ppa.position='procurement_2nd' AND ppa.is_active=true AND (ppa.project_id=po.project_id OR ppa.department_id=$4 OR (ppa.project_id IS NULL AND ppa.department_id IS NULL))))
           OR (po.status = 'pending_approval' AND (EXISTS (SELECT 1 FROM departments d WHERE d.manager_id=$3 AND d.id=$4) OR po.assigned_approver_id=$3))
           OR (po.status IN ('finance_audit','invoiced') AND $6 = true)
           OR ($5 = 'system_admin' AND po.status IN ('inventory_check','store_pricing','market_pricing','price_verification','pending_approval','finance_audit','invoiced'))
         )`,
        [auth.companyId, auth.userId, employeeId, departmentId, auth.role, hasFinance],
      )
      sendOk(res, { total: parseInt((result.rows[0] as Record<string, string>)['total'] ?? '0') })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to count queue', err)
    }
  },
)

// ── GET /my-queue ───────────────────────────────────────────────────────────
// Must be registered before /:id to avoid route shadowing.

ordersRouter.get(
  '/my-queue',
  requirePermission('procurement.po.view', 'view'),
  async (req, res) => {
    try {
      const auth = req.auth!
      const empResult = await query(
        `SELECT id, department_id FROM employees WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
        [auth.userId, auth.companyId],
      )
      const employeeId: string | null = (empResult.rows[0]?.['id'] as string | null) ?? null
      const departmentId: string | null =
        (empResult.rows[0]?.['department_id'] as string | null) ?? null
      const hasFinance = await hasFinanceApproval(auth.userId, auth.companyId, auth.role)

      const result = await query(
        `SELECT DISTINCT po.*, v.name AS vendor_name
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       WHERE po.company_id = $1
         AND po.status NOT IN ('deleted','completed','cancelled')
         AND (
           -- Organizer: draft, goods_received (send to audit), rejected (reopen)
           (po.organizer_id = $2 AND po.status IN ('draft','goods_received','rejected'))
           OR
           -- Store keeper
           (po.status = 'inventory_check' AND EXISTS (
             SELECT 1 FROM po_position_assignments ppa
             WHERE ppa.employee_id   = $3
               AND ppa.position      = 'store_keeper'
               AND ppa.is_active     = true
               AND (ppa.project_id = po.project_id OR ppa.department_id = $4 OR (ppa.project_id IS NULL AND ppa.department_id IS NULL))
           ))
           OR
           -- Store pricing
           (po.status = 'store_pricing' AND EXISTS (
             SELECT 1 FROM po_position_assignments ppa
             WHERE ppa.employee_id   = $3
               AND ppa.position      = 'store_pricing'
               AND ppa.is_active     = true
               AND (ppa.project_id = po.project_id OR ppa.department_id = $4 OR (ppa.project_id IS NULL AND ppa.department_id IS NULL))
           ))
           OR
           -- Procurement officer
           (po.status = 'market_pricing' AND EXISTS (
             SELECT 1 FROM po_position_assignments ppa
             WHERE ppa.employee_id   = $3
               AND ppa.position      = 'procurement_officer'
               AND ppa.is_active     = true
               AND (ppa.project_id = po.project_id OR ppa.department_id = $4 OR (ppa.project_id IS NULL AND ppa.department_id IS NULL))
           ))
           OR
           -- 2nd procurement
           (po.status = 'price_verification' AND EXISTS (
             SELECT 1 FROM po_position_assignments ppa
             WHERE ppa.employee_id   = $3
               AND ppa.position      = 'procurement_2nd'
               AND ppa.is_active     = true
               AND (ppa.project_id = po.project_id OR ppa.department_id = $4 OR (ppa.project_id IS NULL AND ppa.department_id IS NULL))
           ))
           OR
           -- Dept head / assigned approver (approval step)
           (po.status = 'pending_approval' AND (
             EXISTS (
               SELECT 1 FROM departments d WHERE d.manager_id = $3 AND d.id = $4
             )
             OR po.assigned_approver_id = $3
           ))
           OR
           -- Finance approval capability: audit and invoice
           ($6 = true AND po.status IN ('finance_audit','invoiced'))
           OR
           -- System admin sees all in-flight
           ($5 = 'system_admin' AND po.status IN (
             'inventory_check','store_pricing','market_pricing',
             'price_verification','pending_approval','goods_received',
             'finance_audit','invoiced'
           ))
         )
       ORDER BY po.created_at DESC`,
        [auth.companyId, auth.userId, employeeId, departmentId, auth.role, hasFinance],
      )
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch queue', err)
    }
  },
)

// ── GET /positions ──────────────────────────────────────────────────────────

ordersRouter.get(
  '/positions',
  requirePermission('procurement.po.view', 'view'),
  async (req, res) => {
    try {
      const { project_id, department_id } = req.query
      const params: unknown[] = [req.auth!.companyId]
      let sql = `
      SELECT ppa.*,
             e.first_name || ' ' || e.last_name AS employee_name,
             e.job_title,
             p.name  AS project_name,
             d.name  AS department_name
      FROM po_position_assignments ppa
      JOIN employees  e ON e.id = ppa.employee_id
      LEFT JOIN projects    p ON p.id = ppa.project_id
      LEFT JOIN departments d ON d.id = ppa.department_id
      WHERE ppa.company_id = $1 AND ppa.is_active = true`

      if (project_id) {
        sql += ` AND ppa.project_id = $${params.length + 1}`
        params.push(project_id)
      }
      if (department_id) {
        sql += ` AND ppa.department_id = $${params.length + 1}`
        params.push(department_id)
      }
      sql += ` ORDER BY ppa.position, e.first_name`

      const result = await query(sql, params)
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch positions', err)
    }
  },
)

// ── GET / ───────────────────────────────────────────────────────────────────

ordersRouter.get('/', requirePermission('procurement.po.view', 'view'), async (req, res) => {
  try {
    const { status, vendor_id, page = '1', limit = '50' } = req.query
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string)
    const params: unknown[] = [req.auth!.companyId]
    let sql = `SELECT po.*, v.name AS vendor_name
               FROM purchase_orders po
               LEFT JOIN vendors v ON v.id = po.vendor_id
               WHERE po.company_id = $1`
    if (status) {
      sql += ` AND po.status = $${params.length + 1}`
      params.push(status)
    }
    if (vendor_id) {
      sql += ` AND po.vendor_id = $${params.length + 1}`
      params.push(vendor_id)
    }
    sql += ` ORDER BY po.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(parseInt(limit as string), offset)
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch purchase orders', err)
  }
})

// ── GET /:id ────────────────────────────────────────────────────────────────

ordersRouter.get('/:id', requirePermission('procurement.po.view', 'view'), async (req, res) => {
  try {
    const poResult = await query(
      `SELECT po.*, v.name AS vendor_name
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       WHERE po.id = $1 AND po.company_id = $2`,
      [req.params['id']!, req.auth!.companyId],
    )
    const po = poResult.rows[0]
    if (!po) {
      sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
      return
    }

    const lines = await query(`SELECT * FROM po_lines WHERE po_id = $1 ORDER BY line_number`, [
      req.params['id']!,
    ])
    const log = await query(
      `SELECT pal.*, u.email AS actor_email
       FROM po_approval_log pal
       JOIN users u ON u.id = pal.actor_id
       WHERE pal.po_id = $1 ORDER BY pal.created_at`,
      [req.params['id']!],
    )
    sendOk(res, { ...po, lines: lines.rows, approval_log: log.rows })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch purchase order', err)
  }
})

// ── POST / — create (organizer) ─────────────────────────────────────────────

ordersRouter.post('/', requirePermission('procurement.po.edit', 'edit'), async (req, res) => {
  const auth = req.auth!
  const parsed = CreatePOSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }
  const { project_id, currency_code, expected_delivery_date, notes, lines } = parsed.data

  // Look up actor display name before transaction
  const nameRow = await query(
    `SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), email) AS display_name FROM users WHERE id=$1`,
    [auth.userId],
  )
  const actorName =
    ((nameRow.rows[0] as Record<string, unknown>)['display_name'] as string) ?? 'Unknown'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const poNumber = await generatePONumber(client, auth.companyId)

    const poResult = await client.query(
      `INSERT INTO purchase_orders
         (company_id, po_number, status, organizer_id, project_id,
          currency_code, fx_rate, subtotal, tax_amount, total_amount,
          expected_delivery_date, notes, created_by)
       VALUES ($1,$2,'draft',$3,$4,$5,1,0,0,0,$6,$7,$3)
       RETURNING *`,
      [
        auth.companyId,
        poNumber,
        auth.userId,
        project_id ?? null,
        currency_code,
        expected_delivery_date ?? null,
        notes ?? null,
      ],
    )
    const po = poResult.rows[0] as { id: string }

    let lineNum = 1
    for (const line of lines ?? []) {
      const total = Math.round(line.qty_ordered * line.unit_price * 10000) / 10000
      const lineRes = await client.query(
        `INSERT INTO po_lines
           (po_id, line_number, description, product_id, qty_ordered,
            unit_price, currency_code, uom, total_price, account_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          po.id,
          lineNum++,
          line.description,
          line.product_id ?? null,
          line.qty_ordered,
          line.unit_price,
          line.currency_code,
          line.uom,
          total,
          line.account_id ?? null,
        ],
      )
      const newLineId = (lineRes.rows[0] as { id: string }).id
      await client.query(
        `INSERT INTO po_line_comments (po_line_id, po_id, comment, created_by_name) VALUES ($1,$2,'item added',$3)`,
        [newLineId, po.id, actorName],
      )
    }

    if ((lines ?? []).length > 0) await recalculatePOTotals(client, po.id)

    await logAudit({
      companyId: auth.companyId,
      userId: auth.userId,
      action: 'PO_CREATED',
      tableName: 'purchase_orders',
      recordId: po.id,
      newValues: { poNumber, status: 'draft' },
      client,
    })

    await client.query('COMMIT')
    const full = await query(
      `SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id WHERE po.id = $1`,
      [po.id],
    )
    const fullLines = await query(`SELECT * FROM po_lines WHERE po_id = $1 ORDER BY line_number`, [
      po.id,
    ])
    sendOk(res, { ...full.rows[0], lines: fullLines.rows }, 201)
  } catch (err: unknown) {
    await client.query('ROLLBACK')
    const e = err as { code?: string }
    if (e.code === '23505') {
      sendError(res, 409, 'DUPLICATE_PO', 'PO number conflict — retry')
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create purchase order', err)
  } finally {
    client.release()
  }
})

// ── POST /positions — assign position ──────────────────────────────────────

ordersRouter.post(
  '/positions',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const { employee_id, position, project_id, department_id } = req.body as Record<string, string>

    if (!isAdmin(auth.role)) {
      const hasPOAdmin = await userHasPosition(
        { userId: auth.userId, companyId: auth.companyId, poId: '' },
        'po_admin',
      ).catch(() => false)
      if (!hasPOAdmin) {
        sendError(res, 403, 'FORBIDDEN', 'PO admin or system admin required')
        return
      }
    }

    if (!employee_id || !position) {
      sendError(res, 400, 'VALIDATION_ERROR', 'employee_id and position are required')
      return
    }

    try {
      const result = await query(
        `INSERT INTO po_position_assignments
         (company_id, employee_id, position, project_id, department_id, assigned_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
        [
          auth.companyId,
          employee_id,
          position,
          project_id ?? null,
          department_id ?? null,
          auth.userId,
        ],
      )
      sendOk(res, result.rows[0], 201)
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === '23505') {
        sendError(res, 409, 'DUPLICATE_ASSIGNMENT', 'Assignment already exists')
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to assign position', err)
    }
  },
)

// ── DELETE /positions/:id — deactivate position ─────────────────────────────

ordersRouter.delete(
  '/positions/:id',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    if (req.auth!.role !== 'system_admin') {
      sendError(res, 403, 'FORBIDDEN', 'System admin required')
      return
    }

    try {
      await query(
        `UPDATE po_position_assignments SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [req.params['id']!],
      )
      sendOk(res, { message: 'Position assignment removed' })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to remove position', err)
    }
  },
)

// ── POST /:id/submit-to-inventory-check — opening → inventory_check ─────────

ordersRouter.post(
  '/:id/submit-to-inventory-check',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const id = req.params['id']!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: id }
    try {
      const [organizer, admin, poRow] = await Promise.all([
        userIsOrganizer(ctx),
        Promise.resolve(isAdmin(auth.role)),
        query(`SELECT priority FROM purchase_orders WHERE id = $1 AND company_id = $2`, [
          id,
          auth.companyId,
        ]),
      ])
      if (!organizer && !admin) {
        sendError(res, 403, 'FORBIDDEN', 'Only the organizer can submit this PO')
        return
      }

      const isEmergency = poRow.rows[0]?.['priority'] === 'emergency'
      if (isEmergency) {
        await transitionPO(id, 'draft', 'pending_approval', 'submit_emergency_for_approval', auth)
        sendOk(res, { message: 'Emergency PO submitted directly for approval' })
      } else {
        await transitionPO(id, 'draft', 'inventory_check', 'submit_to_inventory_check', auth)
        await notifyPositionHolders(id, 'store_keeper', {
          type: 'PO_INVENTORY_CHECK_REQUIRED',
          title: 'Inventory check required',
          body: `PO ${id} requires an inventory check`,
        })
        sendOk(res, { message: 'PO submitted for inventory check' })
      }
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/confirm-inventory-check — inventory_check → store_pricing ─────

ordersRouter.post(
  '/:id/confirm-inventory-check',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    const { items_in_stock, notes } = req.body as { items_in_stock?: string[]; notes?: string }

    try {
      // Matches the gateway GraphQL resolver: the inventory check is
      // confirmed by the PO's organizer, not a store_keeper position.
      const [organizer, admin] = await Promise.all([
        userIsOrganizer(ctx),
        Promise.resolve(isAdmin(auth.role)),
      ])
      if (!organizer && !admin) {
        sendError(res, 403, 'FORBIDDEN', 'Only the organizer can confirm the inventory check')
        return
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const emp = await client.query(
          `SELECT id FROM employees WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
          [auth.userId, auth.companyId],
        )
        if (emp.rows[0]) {
          await client.query(`UPDATE purchase_orders SET store_keeper_id = $1 WHERE id = $2`, [
            emp.rows[0].id,
            req.params['id']!,
          ])
        }

        if (items_in_stock?.length) {
          await client.query(
            `UPDATE po_lines SET store_price_notes = 'Available in stock — see warehouse'
           WHERE id = ANY($1::uuid[]) AND po_id = $2`,
            [items_in_stock, req.params['id']!],
          )
        }

        await transitionPOInClient(
          client,
          req.params['id']!,
          'inventory_check',
          'store_pricing',
          'confirm_inventory_check',
          auth,
          notes,
          { itemsInStock: items_in_stock },
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      await notifyPositionHolders(req.params['id']!, 'store_pricing', {
        type: 'PO_STORE_PRICING_REQUIRED',
        title: 'Store pricing required',
        body: 'PO requires internal pricing',
      })
      sendOk(res, { message: 'Inventory check confirmed' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/submit-store-pricing — store_pricing → market_pricing ──────────

ordersRouter.post(
  '/:id/submit-store-pricing',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    const { line_prices } = req.body as {
      line_prices?: {
        line_id: string
        store_price: number
        currency_code: string
        notes?: string
      }[]
    }

    try {
      const [hasPos, admin] = await Promise.all([
        userHasPosition(ctx, 'store_pricing'),
        Promise.resolve(isAdmin(auth.role)),
      ])
      if (!hasPos && !admin) {
        sendError(res, 403, 'FORBIDDEN', 'Store pricing position required')
        return
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        for (const lp of line_prices ?? []) {
          await client.query(
            `UPDATE po_lines
           SET store_price = $1, store_price_currency = $2, store_price_notes = $3
           WHERE id = $4 AND po_id = $5`,
            [lp.store_price, lp.currency_code, lp.notes ?? null, lp.line_id, req.params['id']!],
          )
        }

        const emp = await client.query(
          `SELECT id FROM employees WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
          [auth.userId, auth.companyId],
        )
        if (emp.rows[0]) {
          await client.query(`UPDATE purchase_orders SET store_pricing_id = $1 WHERE id = $2`, [
            emp.rows[0].id,
            req.params['id']!,
          ])
        }

        await transitionPOInClient(
          client,
          req.params['id']!,
          'store_pricing',
          'market_pricing',
          'submit_to_market_pricing',
          auth,
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      await notifyPositionHolders(req.params['id']!, 'procurement_officer', {
        type: 'PO_MARKET_PRICING_REQUIRED',
        title: 'Market pricing required',
        body: 'PO requires external vendor quotes',
      })
      sendOk(res, { message: 'Store pricing submitted' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/submit-market-pricing — market_pricing → price_verification ───

ordersRouter.post(
  '/:id/submit-market-pricing',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    const { vendor_id, line_prices } = req.body as {
      vendor_id?: string
      line_prices?: {
        line_id: string
        market_price: number
        vendor_quote_ref?: string
        currency_code: string
      }[]
    }

    try {
      const [hasPos, admin] = await Promise.all([
        userHasPosition(ctx, 'procurement_officer'),
        Promise.resolve(isAdmin(auth.role)),
      ])
      if (!hasPos && !admin) {
        sendError(res, 403, 'FORBIDDEN', 'Procurement officer position required')
        return
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        if (vendor_id) {
          const v = await client.query(
            `SELECT id FROM vendors WHERE id = $1 AND company_id = $2 AND is_active = true`,
            [vendor_id, auth.companyId],
          )
          if (!v.rows[0]) {
            await client.query('ROLLBACK')
            sendError(res, 400, 'INVALID_VENDOR', 'Vendor not found')
            return
          }
          await client.query(`UPDATE purchase_orders SET vendor_id = $1 WHERE id = $2`, [
            vendor_id,
            req.params['id']!,
          ])
        }

        for (const lp of line_prices ?? []) {
          await client.query(
            `UPDATE po_lines
           SET unit_price = $1, total_price = $1 * qty_ordered,
               vendor_quote_ref = $2, currency_code = $3
           WHERE id = $4 AND po_id = $5`,
            [
              lp.market_price,
              lp.vendor_quote_ref ?? null,
              lp.currency_code,
              lp.line_id,
              req.params['id']!,
            ],
          )
        }
        if ((line_prices ?? []).length > 0) await recalculatePOTotals(client, req.params['id']!)

        const emp = await client.query(
          `SELECT id FROM employees WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
          [auth.userId, auth.companyId],
        )
        if (emp.rows[0]) {
          await client.query(
            `UPDATE purchase_orders SET procurement_officer_id = $1 WHERE id = $2`,
            [emp.rows[0].id, req.params['id']!],
          )
        }

        await transitionPOInClient(
          client,
          req.params['id']!,
          'market_pricing',
          'price_verification',
          'submit_to_price_verification',
          auth,
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      await notifyPositionHolders(req.params['id']!, 'procurement_2nd', {
        type: 'PO_PRICE_VERIFICATION_REQUIRED',
        title: 'Price verification required',
        body: 'PO market prices require cross-checking',
      })
      sendOk(res, { message: 'Market pricing submitted' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/submit-price-verification — price_verification → review ────────

ordersRouter.post(
  '/:id/submit-price-verification',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    const { verification_notes, line_adjustments } = req.body as {
      verification_notes?: string
      line_adjustments?: { line_id: string; verified_price: number; notes?: string }[]
    }

    try {
      const [hasPos, admin] = await Promise.all([
        userHasPosition(ctx, 'procurement_2nd'),
        Promise.resolve(isAdmin(auth.role)),
      ])
      if (!hasPos && !admin) {
        sendError(res, 403, 'FORBIDDEN', '2nd procurement position required')
        return
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        for (const adj of line_adjustments ?? []) {
          await client.query(
            `UPDATE po_lines
           SET unit_price = $1, total_price = $1 * qty_ordered, verification_notes = $2
           WHERE id = $3 AND po_id = $4`,
            [adj.verified_price, adj.notes ?? null, adj.line_id, req.params['id']!],
          )
        }
        if ((line_adjustments ?? []).length > 0)
          await recalculatePOTotals(client, req.params['id']!)

        const emp = await client.query(
          `SELECT id FROM employees WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
          [auth.userId, auth.companyId],
        )
        if (emp.rows[0]) {
          await client.query(`UPDATE purchase_orders SET procurement_2nd_id = $1 WHERE id = $2`, [
            emp.rows[0].id,
            req.params['id']!,
          ])
        }

        await transitionPOInClient(
          client,
          req.params['id']!,
          'price_verification',
          'pending_approval',
          'submit_for_approval',
          auth,
          undefined,
          { verificationNotes: verification_notes },
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      // Notify dept heads and admins that PO is pending approval
      await notifyDeptHeadsAndAdmins(req.params['id']!, {
        type: 'PO_APPROVAL_REQUIRED',
        title: 'PO approval required',
        body: 'A purchase order is awaiting your approval',
      })
      sendOk(res, { message: 'Price verification submitted — PO awaiting approval' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// request-approval removed: price_verification now transitions directly to pending_approval via submit-price-verification

// ── POST /:id/reject-to-market-pricing — pending_approval → market_pricing ───

ordersRouter.post(
  '/:id/reject-to-market-pricing',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) {
      sendError(res, 400, 'REASON_REQUIRED', 'Rejection reason is required')
      return
    }

    try {
      const [deptHead, assignedApprover, admin] = await Promise.all([
        userIsDeptHead(ctx),
        userIsAssignedApprover(ctx),
        Promise.resolve(isAdmin(auth.role)),
      ])
      if (!deptHead && !assignedApprover && !admin) {
        sendError(res, 403, 'FORBIDDEN', 'Department head or admin required')
        return
      }

      await transitionPO(
        req.params['id']!,
        'pending_approval',
        'market_pricing',
        'reject_to_market_pricing',
        auth,
        reason,
      )
      await notifyPositionHolders(req.params['id']!, 'procurement_officer', {
        type: 'PO_PRICING_REJECTED',
        title: 'PO pricing rejected',
        body: `The organizer rejected pricing: ${reason}`,
      })
      sendOk(res, { message: 'PO returned to market pricing' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/approve — pending_approval → approved ─────────────────────────

ordersRouter.post(
  '/:id/approve',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }

    try {
      const poRow = await query(
        `SELECT status, organizer_id, po_number FROM purchase_orders WHERE id = $1`,
        [req.params['id']!],
      )
      if (!poRow.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
        return
      }

      if (poRow.rows[0]['status'] !== 'pending_approval') {
        sendError(
          res,
          422,
          'INVALID_STATUS',
          `Cannot approve PO in status: ${String(poRow.rows[0]['status'])}`,
        )
        return
      }

      const [admin, deptHead, assignedApprover] = await Promise.all([
        Promise.resolve(isAdmin(auth.role)),
        userIsDeptHead(ctx),
        userIsAssignedApprover(ctx),
      ])
      if (!admin && !deptHead && !assignedApprover) {
        sendError(res, 403, 'FORBIDDEN', 'Department head or admin required to approve')
        return
      }

      await transitionPO(req.params['id']!, 'pending_approval', 'approved', 'approve', auth)

      const approveOrgId = poRow.rows[0]['organizer_id'] as string | null
      if (approveOrgId) {
        await query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications','PO_APPROVED_NOTIFICATION',$1)`,
          [
            JSON.stringify({
              userId: approveOrgId,
              poId: req.params['id']!,
              poNumber: poRow.rows[0]['po_number'],
            }),
          ],
        )
      }
      await query(
        `INSERT INTO service_outbox (service, event_type, payload) VALUES ('reporting','PO_PDF_REQUESTED',$1)`,
        [JSON.stringify({ po_id: req.params['id']!, company_id: auth.companyId })],
      )
      sendOk(res, { message: 'PO approved' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/reject — pending_approval → rejected ───────────────────────────

ordersRouter.post(
  '/:id/reject',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) {
      sendError(res, 400, 'REASON_REQUIRED', 'Rejection reason is required')
      return
    }

    try {
      const poRow = await query(`SELECT status, organizer_id FROM purchase_orders WHERE id = $1`, [
        req.params['id']!,
      ])
      if (!poRow.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
        return
      }
      if (poRow.rows[0]['status'] !== 'pending_approval') {
        sendError(
          res,
          422,
          'INVALID_STATUS',
          `Cannot reject PO in status: ${String(poRow.rows[0]['status'])}`,
        )
        return
      }

      const [admin, deptHead, assignedApprover] = await Promise.all([
        Promise.resolve(isAdmin(auth.role)),
        userIsDeptHead(ctx),
        userIsAssignedApprover(ctx),
      ])
      if (!admin && !deptHead && !assignedApprover) {
        sendError(res, 403, 'FORBIDDEN', 'Department head or admin required to reject')
        return
      }

      await transitionPO(req.params['id']!, 'pending_approval', 'rejected', 'reject', auth, reason)

      const rejectOrgId = poRow.rows[0]['organizer_id'] as string | null
      if (rejectOrgId) {
        await query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications','PO_REJECTED_NOTIFICATION',$1)`,
          [JSON.stringify({ userId: rejectOrgId, poId: req.params['id']!, reason })],
        )
      }
      sendOk(res, { message: 'PO rejected' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/reopen — rejected → draft ──────────────────────────────────────

ordersRouter.post(
  '/:id/reopen',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    try {
      const poRow = await query(`SELECT status FROM purchase_orders WHERE id = $1`, [
        req.params['id']!,
      ])
      if (!poRow.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
        return
      }
      if (poRow.rows[0]['status'] !== 'rejected') {
        sendError(res, 422, 'INVALID_STATUS', 'PO must be in rejected status to reopen')
        return
      }

      const [organizer, admin] = await Promise.all([
        userIsOrganizer(ctx),
        Promise.resolve(isAdmin(auth.role)),
      ])
      if (!organizer && !admin) {
        sendError(res, 403, 'FORBIDDEN', 'Organizer or admin required to reopen PO')
        return
      }

      await transitionPO(req.params['id']!, 'rejected', 'draft', 'reopen', auth)
      sendOk(res, { message: 'PO reopened as draft' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/cancel — any active status → cancelled ─────────────────────────

ordersRouter.post(
  '/:id/cancel',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    const { reason } = req.body as { reason?: string }
    try {
      const poRow = await query(
        `SELECT status, organizer_id, po_number FROM purchase_orders WHERE id = $1`,
        [req.params['id']!],
      )
      if (!poRow.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
        return
      }
      const currentStatus = poRow.rows[0]['status'] as string
      const cancellable = [
        'draft',
        'inventory_check',
        'store_pricing',
        'market_pricing',
        'price_verification',
        'pending_approval',
        'approved',
        'ready_to_issue',
        'goods_received',
        'finance_audit',
        'invoiced',
      ]
      if (!cancellable.includes(currentStatus)) {
        sendError(res, 422, 'INVALID_STATUS', `Cannot cancel PO in status '${currentStatus}'`)
        return
      }

      const [organizer, admin] = await Promise.all([
        userIsOrganizer(ctx),
        Promise.resolve(isAdmin(auth.role)),
      ])
      if (!organizer && !admin) {
        sendError(res, 403, 'FORBIDDEN', 'Organizer or admin required to cancel PO')
        return
      }

      await transitionPO(
        req.params['id']!,
        currentStatus as import('@fnc-erp/workflow').POStatus,
        'cancelled',
        'cancel',
        auth,
        reason,
      )

      const orgId = poRow.rows[0]['organizer_id'] as string | null
      const poNum = String(poRow.rows[0]['po_number'] ?? '')
      if (orgId && orgId !== auth.userId) {
        notifyUser(orgId, auth.companyId, {
          type: 'PO_CANCELLED',
          title: `PO Cancelled: ${poNum}`,
          body: `Purchase order ${poNum} has been cancelled${reason ? ': ' + reason : ''}`,
          poId: req.params['id']!,
          poNumber: poNum,
        }).catch(() => {
          /* notification failure must not break the response */
        })
      }
      sendOk(res, { message: 'PO cancelled' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/send-to-audit — goods_received → finance_audit ─────────────────

ordersRouter.post(
  '/:id/send-to-audit',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    try {
      const poRow = await query(`SELECT status, po_number FROM purchase_orders WHERE id = $1`, [
        req.params['id']!,
      ])
      if (!poRow.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
        return
      }
      if (poRow.rows[0]['status'] !== 'goods_received') {
        sendError(
          res,
          422,
          'INVALID_STATUS',
          'PO must be in goods_received status to send to audit',
        )
        return
      }

      const [organizer, admin] = await Promise.all([
        userIsOrganizer(ctx),
        Promise.resolve(isAdmin(auth.role)),
      ])
      if (!organizer && !admin) {
        sendError(res, 403, 'FORBIDDEN', 'Organizer or admin required')
        return
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await transitionPOInClient(
          client,
          req.params['id']!,
          'goods_received',
          'finance_audit',
          'send_to_audit',
          auth,
        )
        await client.query(
          `UPDATE po_lines SET audit_status='pending', audit_note=NULL WHERE po_id=$1`,
          [req.params['id']!],
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      const poNum = String(poRow.rows[0]['po_number'] ?? '')
      notifyFinanceTeam(auth.companyId, {
        type: 'PO_SENT_TO_AUDIT',
        title: `PO submitted for audit: ${poNum}`,
        body: `Purchase order ${poNum} has been submitted for finance audit`,
        poId: req.params['id']!,
        poNumber: poNum,
      }).catch(() => {})

      sendOk(res, { message: 'PO sent to finance audit' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/pass-audit — finance_audit → invoiced ──────────────────────────

ordersRouter.post(
  '/:id/pass-audit',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const auth = req.auth!
    if (!(await hasFinanceApproval(auth.userId, auth.companyId, auth.role))) {
      sendError(res, 403, 'FORBIDDEN', 'Finance approval permission required to pass audit')
      return
    }

    try {
      const poRow = await query(
        `SELECT status, organizer_id, po_number FROM purchase_orders WHERE id = $1`,
        [req.params['id']!],
      )
      if (!poRow.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
        return
      }
      if (poRow.rows[0]['status'] !== 'finance_audit') {
        sendError(res, 422, 'INVALID_STATUS', 'PO must be in finance_audit status')
        return
      }

      const flaggedRes = await query(
        `SELECT COUNT(*) AS c FROM po_lines WHERE po_id=$1 AND audit_status='flagged'`,
        [req.params['id']!],
      )
      const flagged = parseInt(String(flaggedRes.rows[0]?.['c'] ?? '0'))
      if (flagged > 0) {
        sendError(
          res,
          422,
          'LINES_FLAGGED',
          `Cannot pass audit: ${flagged} line${flagged > 1 ? 's are' : ' is'} flagged`,
        )
        return
      }

      await transitionPO(req.params['id']!, 'finance_audit', 'invoiced', 'pass_audit', auth)

      const orgId = poRow.rows[0]['organizer_id'] as string | null
      const poNum = String(poRow.rows[0]['po_number'] ?? '')
      if (orgId) {
        notifyUser(orgId, auth.companyId, {
          type: 'PO_AUDIT_PASSED',
          title: `Finance audit passed: ${poNum}`,
          body: `Your purchase order ${poNum} has passed finance audit and is now invoiced`,
          poId: req.params['id']!,
          poNumber: poNum,
        }).catch(() => {})
      }
      sendOk(res, { message: 'Audit passed — PO marked as invoiced' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/fail-audit — finance_audit → goods_received ────────────────────

ordersRouter.post(
  '/:id/fail-audit',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const auth = req.auth!
    const { notes } = req.body as { notes?: string }
    if (!(await hasFinanceApproval(auth.userId, auth.companyId, auth.role))) {
      sendError(res, 403, 'FORBIDDEN', 'Finance approval permission required to fail audit')
      return
    }

    try {
      const poRow = await query(
        `SELECT status, organizer_id, po_number FROM purchase_orders WHERE id = $1`,
        [req.params['id']!],
      )
      if (!poRow.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
        return
      }
      if (poRow.rows[0]['status'] !== 'finance_audit') {
        sendError(res, 422, 'INVALID_STATUS', 'PO must be in finance_audit status')
        return
      }

      await transitionPO(
        req.params['id']!,
        'finance_audit',
        'goods_received',
        'fail_audit',
        auth,
        notes,
      )

      const orgId = poRow.rows[0]['organizer_id'] as string | null
      const poNum = String(poRow.rows[0]['po_number'] ?? '')
      if (orgId) {
        notifyUser(orgId, auth.companyId, {
          type: 'PO_AUDIT_FAILED',
          title: `Finance audit failed: ${poNum}`,
          body: `Your purchase order ${poNum} has failed finance audit${notes ? ': ' + notes : ''}. Please review and resubmit.`,
          poId: req.params['id']!,
          poNumber: poNum,
        }).catch(() => {})
      }
      sendOk(res, { message: 'Audit failed — PO returned to goods received for correction' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── PATCH /:id/lines/:lineId/audit-status — set per-line audit status ────────

ordersRouter.patch(
  '/:id/lines/:lineId/audit-status',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const auth = req.auth!
    if (!(await hasFinanceApproval(auth.userId, auth.companyId, auth.role))) {
      sendError(res, 403, 'FORBIDDEN', 'Finance approval permission required to audit PO lines')
      return
    }
    const { id, lineId } = req.params
    const { audit_status, audit_note } = req.body as { audit_status?: string; audit_note?: string }
    const valid = ['pending', 'ok', 'flagged']
    if (!audit_status || !valid.includes(audit_status)) {
      sendError(res, 400, 'VALIDATION_ERROR', `audit_status must be one of: ${valid.join(', ')}`)
      return
    }

    try {
      const poRow = await query(`SELECT status FROM purchase_orders WHERE id=$1`, [id])
      if (!poRow.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'PO not found')
        return
      }
      if (poRow.rows[0]['status'] !== 'finance_audit') {
        sendError(res, 422, 'INVALID_STATUS', 'PO must be in finance_audit status to audit lines')
        return
      }

      const result = await query(
        `UPDATE po_lines SET audit_status=$1, audit_note=$2 WHERE id=$3 AND po_id=$4
       RETURNING id, audit_status, audit_note, actual_unit_price, qty_received`,
        [audit_status, audit_note ?? null, lineId, id],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'PO line not found')
        return
      }
      sendOk(res, result.rows[0])
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/complete — invoiced → completed ────────────────────────────────

ordersRouter.post(
  '/:id/complete',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const auth = req.auth!
    const { receipt_notes } = req.body as { receipt_notes?: string }

    try {
      if (!(await hasFinanceApproval(auth.userId, auth.companyId, auth.role))) {
        sendError(res, 403, 'FORBIDDEN', 'Finance approval permission required to complete PO')
        return
      }

      const poRow = await query(
        `SELECT status, organizer_id, po_number FROM purchase_orders WHERE id = $1`,
        [req.params['id']!],
      )
      if (!poRow.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
        return
      }
      if (poRow.rows[0]['status'] !== 'invoiced') {
        sendError(
          res,
          422,
          'INVALID_STATUS',
          `PO must be in invoiced status to complete. Current: ${String(poRow.rows[0]['status'])}`,
        )
        return
      }

      await transitionPO(
        req.params['id']!,
        'invoiced',
        'completed',
        'complete',
        auth,
        receipt_notes,
        { receiptNotes: receipt_notes },
      )
      await query(
        `INSERT INTO service_outbox (service, event_type, payload) VALUES ('finance','PO_COMPLETION_JOURNAL_REQUESTED',$1)`,
        [
          JSON.stringify({
            po_id: req.params['id']!,
            company_id: auth.companyId,
            receipt_notes,
          }),
        ],
      )

      const orgId = poRow.rows[0]['organizer_id'] as string | null
      const poNum = String(poRow.rows[0]['po_number'] ?? '')
      if (orgId) {
        notifyUser(orgId, auth.companyId, {
          type: 'PO_COMPLETED',
          title: `PO Completed: ${poNum}`,
          body: `Purchase order ${poNum} has been successfully completed`,
          poId: req.params['id']!,
          poNumber: poNum,
        }).catch(() => {})
      }
      sendOk(res, { message: 'PO completed' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/delete — draft or inventory_check → deleted ────────────────────

ordersRouter.post(
  '/:id/delete',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const ctx = { userId: auth.userId, companyId: auth.companyId, poId: req.params['id']! }
    const { reason } = req.body as { reason?: string }

    try {
      const poRow = await query(`SELECT status FROM purchase_orders WHERE id = $1`, [
        req.params['id']!,
      ])
      const currentStatus = poRow.rows[0]?.['status'] as string | undefined

      if (!['draft', 'inventory_check'].includes(currentStatus ?? '')) {
        sendError(
          res,
          400,
          'CANNOT_DELETE',
          'PO can only be deleted from draft or inventory_check status',
        )
        return
      }

      const [organizer, admin] = await Promise.all([
        userIsOrganizer(ctx),
        Promise.resolve(isAdmin(auth.role)),
      ])
      if (!organizer && !admin) {
        sendError(res, 403, 'FORBIDDEN', 'Organizer or admin required to delete PO')
        return
      }

      await transitionPO(
        req.params['id']!,
        currentStatus as import('@fnc-erp/workflow').POStatus,
        'deleted',
        'delete',
        auth,
        reason,
      )
      sendOk(res, { message: 'PO deleted' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── PO Edit Requests ─────────────────────────────────────────────────────────
// changes JSON shape:
// { header: { field: { from, to } }, lines: { edited: [{id,field,from,to}], added: [{...}], removed: [id] } }

async function userInPOScope(userId: string, companyId: string, poId: string): Promise<boolean> {
  // created_by, assigned_to, or any active project member
  const r = await query(
    `SELECT 1 FROM purchase_orders po
     WHERE po.id = $1 AND po.company_id = $2
       AND (
         po.created_by = $3
         OR po.assigned_to = $3
         OR EXISTS (
           SELECT 1 FROM project_members pm
           JOIN employees emp ON emp.id = pm.employee_id
           WHERE pm.project_id = po.project_id
             AND emp.user_id = $3
             AND pm.is_active = true
         )
       )
     LIMIT 1`,
    [poId, companyId, userId],
  )
  return r.rowCount !== null && r.rowCount > 0
}

// POST /:id/edit-requests — submit a change request
ordersRouter.post(
  '/:id/edit-requests',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = req.auth!
    const poId = req.params['id']!
    const { changes, notes } = req.body as { changes: unknown; notes?: string }

    if (!changes || typeof changes !== 'object') {
      sendError(res, 400, 'INVALID_INPUT', 'changes object is required')
      return
    }

    try {
      // Scope check: admin bypasses, others must be in scope
      if (!isAdmin(auth.role)) {
        const inScope = await userInPOScope(auth.userId, auth.companyId, poId)
        if (!inScope) {
          sendError(res, 403, 'FORBIDDEN', 'You are not associated with this PO or its project')
          return
        }
      }

      // Only one pending request at a time per PO
      const existing = await query(
        `SELECT id FROM po_edit_requests WHERE po_id = $1 AND status = 'pending' LIMIT 1`,
        [poId],
      )
      if ((existing.rowCount ?? 0) > 0) {
        sendError(
          res,
          409,
          'PENDING_EXISTS',
          'A pending edit request already exists for this PO. It must be approved or rejected first.',
        )
        return
      }

      const result = await query(
        `INSERT INTO po_edit_requests (po_id, requested_by, changes, request_notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
        [poId, auth.userId, JSON.stringify(changes), notes ?? null],
      )

      const poInfo = await query(`SELECT po_number FROM purchase_orders WHERE id=$1`, [poId])
      const poNum = String(poInfo.rows[0]?.['po_number'] ?? poId)
      notifyDeptHeadsAndAdmins(poId, {
        type: 'PO_EDIT_REQUEST_SUBMITTED',
        title: `Edit request: ${poNum}`,
        body: `A change request has been submitted for ${poNum}${notes ? ': ' + notes : ''}`,
      }).catch(() => {})
      sendOk(res, result.rows[0])
    } catch (err) {
      handleError(res, err)
    }
  },
)

// GET /:id/edit-requests — list edit requests for a PO
ordersRouter.get(
  '/:id/edit-requests',
  requirePermission('procurement.po.view', 'view'),
  async (req, res) => {
    const auth = req.auth!
    const poId = req.params['id']!

    try {
      if (!isAdmin(auth.role)) {
        const inScope = await userInPOScope(auth.userId, auth.companyId, poId)
        if (!inScope) {
          sendError(res, 403, 'FORBIDDEN', 'You are not associated with this PO or its project')
          return
        }
      }

      const result = await query(
        `SELECT er.*,
              req.email  AS requested_by_email,
              rev.email  AS reviewed_by_email
       FROM po_edit_requests er
       JOIN users req ON req.id = er.requested_by
       LEFT JOIN users rev ON rev.id = er.reviewed_by
       WHERE er.po_id = $1
       ORDER BY er.created_at DESC`,
        [poId],
      )
      sendOk(res, result.rows)
    } catch (err) {
      handleError(res, err)
    }
  },
)

// POST /:id/edit-requests/:reqId/approve — admin applies the diff
ordersRouter.post(
  '/:id/edit-requests/:reqId/approve',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const auth = req.auth!
    if (!isAdmin(auth.role)) {
      sendError(res, 403, 'FORBIDDEN', 'Admin role required to approve edit requests')
      return
    }

    const poId = req.params['id']!
    const reqId = req.params['reqId']!
    const { review_notes } = req.body as { review_notes?: string }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const erRow = await client.query(
        `SELECT * FROM po_edit_requests WHERE id = $1 AND po_id = $2 AND status = 'pending'`,
        [reqId, poId],
      )
      if (!erRow.rows[0]) {
        await client.query('ROLLBACK')
        sendError(res, 404, 'NOT_FOUND', 'Pending edit request not found')
        return
      }

      const changes = erRow.rows[0].changes as {
        header?: Record<string, { from: unknown; to: unknown }>
        lines?: {
          edited?: { id: string; field: string; to: unknown }[]
          added?: Record<string, unknown>[]
          removed?: string[]
        }
      }

      // Apply header changes
      if (changes.header && Object.keys(changes.header).length > 0) {
        const allowed = [
          'notes',
          'expected_delivery_date',
          'vendor_id',
          'analytic_account_id',
          'currency_code',
        ]
        const sets: string[] = []
        const vals: unknown[] = []
        for (const [field, diff] of Object.entries(changes.header)) {
          if (!allowed.includes(field)) continue
          sets.push(`${field} = $${vals.length + 1}`)
          vals.push(diff.to)
        }
        if (sets.length > 0) {
          vals.push(poId)
          await client.query(
            `UPDATE purchase_orders SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}`,
            vals,
          )
        }
      }

      // Apply line changes
      if (changes.lines) {
        // Edited lines
        for (const edit of changes.lines.edited ?? []) {
          const lineAllowed = [
            'description',
            'qty_ordered',
            'unit_price',
            'uom',
            'product_id',
            'account_id',
          ]
          if (!lineAllowed.includes(edit.field)) continue
          await client.query(
            `UPDATE po_lines SET ${edit.field} = $1 WHERE id = $2 AND po_id = $3`,
            [edit.to, edit.id, poId],
          )
        }
        // Added lines — recalc total_price
        const editActorNameRow = await query(
          `SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), email) AS display_name FROM users WHERE id=$1`,
          [auth.userId],
        )
        const editActorName =
          ((editActorNameRow.rows[0] as Record<string, unknown>)['display_name'] as string) ??
          'Unknown'
        for (const line of changes.lines.added ?? []) {
          const qty = Number(line['qty_ordered'] ?? 0)
          const price = Number(line['unit_price'] ?? 0)
          const addedLineRes = await client.query(
            `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, currency_code, uom, total_price)
           VALUES ($1,
             (SELECT COALESCE(MAX(line_number),0)+1 FROM po_lines WHERE po_id=$1),
             $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              poId,
              line['description'],
              line['product_id'] ?? null,
              qty,
              price,
              line['currency_code'] ?? 'IQD',
              line['uom'] ?? 'unit',
              qty * price,
            ],
          )
          const addedLineId = (addedLineRes.rows[0] as { id: string }).id
          await client.query(
            `INSERT INTO po_line_comments (po_line_id, po_id, comment, created_by_name) VALUES ($1,$2,'item added',$3)`,
            [addedLineId, poId, editActorName],
          )
        }
        // Removed lines
        for (const lineId of changes.lines.removed ?? []) {
          await client.query(`DELETE FROM po_lines WHERE id = $1 AND po_id = $2`, [lineId, poId])
        }
        // Recalculate PO totals from lines
        await client.query(
          `UPDATE purchase_orders SET
           subtotal     = (SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1),
           total_amount = (SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1),
           updated_at   = NOW()
         WHERE id = $1`,
          [poId],
        )
      }

      // Mark request approved
      await client.query(
        `UPDATE po_edit_requests SET status='approved', reviewed_by=$1, review_notes=$2, reviewed_at=NOW() WHERE id=$3`,
        [auth.userId, review_notes ?? null, reqId],
      )

      // Log in approval log
      await client.query(
        `INSERT INTO po_approval_log (po_id, actor_id, action, notes) VALUES ($1,$2,'edit_approved',$3)`,
        [poId, auth.userId, review_notes ?? 'Edit request approved'],
      )

      await client.query('COMMIT')

      const requesterId = erRow.rows[0].requested_by as string
      const poInfoRes = await query(`SELECT po_number FROM purchase_orders WHERE id=$1`, [poId])
      const poNum = String(poInfoRes.rows[0]?.['po_number'] ?? poId)
      notifyUser(requesterId, auth.companyId, {
        type: 'PO_EDIT_REQUEST_APPROVED',
        title: `Edit request approved: ${poNum}`,
        body: `Your change request for ${poNum} has been approved${review_notes ? ': ' + review_notes : ''}`,
        poId,
        poNumber: poNum,
      }).catch(() => {})

      sendOk(res, { message: 'Edit request approved and changes applied' })
    } catch (err) {
      await client.query('ROLLBACK')
      handleError(res, err)
    } finally {
      client.release()
    }
  },
)

// POST /:id/edit-requests/:reqId/reject — admin rejects
ordersRouter.post(
  '/:id/edit-requests/:reqId/reject',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const auth = req.auth!
    if (!isAdmin(auth.role)) {
      sendError(res, 403, 'FORBIDDEN', 'Admin role required to reject edit requests')
      return
    }

    const poId = req.params['id']!
    const reqId = req.params['reqId']!
    const { review_notes } = req.body as { review_notes?: string }

    if (!review_notes?.trim()) {
      sendError(res, 400, 'INVALID_INPUT', 'review_notes is required when rejecting')
      return
    }

    try {
      const result = await query(
        `UPDATE po_edit_requests SET status='rejected', reviewed_by=$1, review_notes=$2, reviewed_at=NOW()
       WHERE id=$3 AND po_id=$4 AND status='pending' RETURNING id, requested_by`,
        [auth.userId, review_notes, reqId, poId],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Pending edit request not found')
        return
      }

      await query(
        `INSERT INTO po_approval_log (po_id, actor_id, action, notes) VALUES ($1,$2,'edit_rejected',$3)`,
        [poId, auth.userId, review_notes],
      )

      const requesterId = result.rows[0]['requested_by'] as string
      const poInfoRes = await query(`SELECT po_number FROM purchase_orders WHERE id=$1`, [poId])
      const poNum = String(poInfoRes.rows[0]?.['po_number'] ?? poId)
      notifyUser(requesterId, auth.companyId, {
        type: 'PO_EDIT_REQUEST_REJECTED',
        title: `Edit request rejected: ${poNum}`,
        body: `Your change request for ${poNum} was rejected: ${review_notes}`,
        poId,
        poNumber: poNum,
      }).catch(() => {})

      sendOk(res, { message: 'Edit request rejected' })
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── GET /:id/line-comments — fetch all line comments for a PO ───────────────
ordersRouter.get(
  '/:id/line-comments',
  requirePermission('procurement.po.view', 'view'),
  async (req, res) => {
    const auth = (req as import('express').Request & { auth?: { companyId: string } }).auth
    if (!auth) {
      sendError(res, 401, 'UNAUTHORIZED', 'Not authenticated')
      return
    }
    const { id } = req.params
    try {
      const result = await query(
        `SELECT c.id, c.po_line_id, c.comment, c.created_by_name, c.created_at,
              c.flag, c.resolved, c.resolved_by, c.resolved_at,
              ru.email AS resolved_by_email
       FROM po_line_comments c
       JOIN purchase_orders po ON po.id = c.po_id
       LEFT JOIN users ru ON ru.id = c.resolved_by
       WHERE c.po_id = $1 AND po.company_id = $2
       ORDER BY c.created_at ASC`,
        [id, auth.companyId],
      )
      sendOk(res, result.rows)
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── POST /:id/lines/:lineId/comments — add a comment (with optional flag) ───
ordersRouter.post(
  '/:id/lines/:lineId/comments',
  requirePermission('procurement.po.view', 'view'),
  async (req, res) => {
    const auth = (
      req as import('express').Request & { auth?: { companyId: string; userId: string } }
    ).auth
    if (!auth) {
      sendError(res, 401, 'UNAUTHORIZED', 'Not authenticated')
      return
    }
    const { id, lineId } = req.params
    const { comment, flag } = req.body as { comment?: string; flag?: string }
    if (!comment?.trim()) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Comment is required')
      return
    }
    const validFlags = ['info', 'warning', 'dispute']
    const safeFlag = flag && validFlags.includes(flag) ? flag : null
    try {
      const po = await query(`SELECT id FROM purchase_orders WHERE id=$1 AND company_id=$2`, [
        id,
        auth.companyId,
      ])
      if (!po.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'PO not found')
        return
      }
      const userRow = await query(
        `SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), email) AS display_name FROM users WHERE id=$1`,
        [auth.userId],
      )
      const displayName =
        ((userRow.rows[0] as Record<string, unknown>)['display_name'] as string) ?? 'Unknown'
      const result = await query(
        `INSERT INTO po_line_comments (po_line_id, po_id, comment, created_by_name, flag)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, po_line_id, comment, created_by_name, created_at, flag, resolved, resolved_by, resolved_at`,
        [lineId, id, comment.trim(), displayName, safeFlag],
      )
      sendOk(res, result.rows[0], 201)
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── PATCH /:id/lines/:lineId/comments/:commentId/resolve — resolve a flag ───
ordersRouter.patch(
  '/:id/lines/:lineId/comments/:commentId/resolve',
  requirePermission('procurement.po.view', 'view'),
  async (req, res) => {
    const auth = (
      req as import('express').Request & { auth?: { companyId: string; userId: string } }
    ).auth
    if (!auth) {
      sendError(res, 401, 'UNAUTHORIZED', 'Not authenticated')
      return
    }
    const { id, commentId } = req.params
    try {
      const po = await query(`SELECT id FROM purchase_orders WHERE id=$1 AND company_id=$2`, [
        id,
        auth.companyId,
      ])
      if (!po.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'PO not found')
        return
      }
      const result = await query(
        `UPDATE po_line_comments SET resolved=true, resolved_by=$1, resolved_at=NOW()
       WHERE id=$2 AND po_id=$3 AND flag IS NOT NULL AND resolved=false
       RETURNING id, resolved, resolved_at`,
        [auth.userId, commentId, id],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Flag not found or already resolved')
        return
      }
      sendOk(res, result.rows[0])
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── PATCH /:id/priority — set PO priority ────────────────────────────────────
ordersRouter.patch(
  '/:id/priority',
  requirePermission('procurement.po.view', 'view'),
  async (req, res) => {
    const auth = (
      req as import('express').Request & { auth?: { companyId: string; userId: string } }
    ).auth
    if (!auth) {
      sendError(res, 401, 'UNAUTHORIZED', 'Not authenticated')
      return
    }
    const { id } = req.params
    const { priority } = req.body as { priority?: string }
    if (!priority || !['low', 'high', 'emergency'].includes(priority)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'priority must be low, high, or emergency')
      return
    }
    try {
      const result = await query(
        `UPDATE purchase_orders SET priority=$1, updated_at=NOW()
       WHERE id=$2 AND company_id=$3
       RETURNING id, priority`,
        [priority, id, auth.companyId],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'PO not found')
        return
      }
      sendOk(res, result.rows[0])
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── PATCH /:id/receiver — assign the employee who will receive items ──────────
ordersRouter.patch(
  '/:id/receiver',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = (
      req as import('express').Request & { auth?: { companyId: string; userId: string } }
    ).auth
    if (!auth) {
      sendError(res, 401, 'UNAUTHORIZED', 'Not authenticated')
      return
    }
    const { id } = req.params
    const { employee_id } = req.body as { employee_id?: string | null }
    try {
      // Verify employee belongs to same company (or allow null to unset)
      let receiverUserId: string | null = null
      if (employee_id) {
        const emp = await query(`SELECT id, user_id FROM employees WHERE id=$1 AND company_id=$2`, [
          employee_id,
          auth.companyId,
        ])
        if (!emp.rows[0]) {
          sendError(res, 404, 'NOT_FOUND', 'Employee not found')
          return
        }
        receiverUserId = (emp.rows[0]['user_id'] as string | null) ?? null
      }
      const result = await query(
        `UPDATE purchase_orders SET assigned_receiver_id=$1, updated_at=NOW()
       WHERE id=$2 AND company_id=$3
       RETURNING id, assigned_receiver_id, po_number`,
        [employee_id ?? null, id, auth.companyId],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'PO not found')
        return
      }

      if (employee_id && receiverUserId) {
        const poNum = String(result.rows[0]['po_number'] ?? '')
        notifyUser(receiverUserId, auth.companyId, {
          type: 'PO_RECEIVER_ASSIGNED',
          title: `You are assigned to receive: ${poNum}`,
          body: `You have been designated as the receiver for purchase order ${poNum}`,
          poId: String(id),
          poNumber: poNum,
        }).catch(() => {})
      }
      sendOk(res, result.rows[0])
    } catch (err) {
      handleError(res, err)
    }
  },
)

// ── PATCH /:id/lines/:lineId/actual-price — record actual unit price paid ────
ordersRouter.patch(
  '/:id/lines/:lineId/actual-price',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const auth = (
      req as import('express').Request & { auth?: { companyId: string; userId: string } }
    ).auth
    if (!auth) {
      sendError(res, 401, 'UNAUTHORIZED', 'Not authenticated')
      return
    }
    const { id, lineId } = req.params
    const { actual_unit_price } = req.body as { actual_unit_price?: number | null }
    try {
      // Verify line belongs to this PO and company
      const lineCheck = await query(
        `SELECT pl.id FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id
       WHERE pl.id=$1 AND pl.po_id=$2 AND po.company_id=$3`,
        [lineId, id, auth.companyId],
      )
      if (!lineCheck.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'PO line not found')
        return
      }
      const result = await query(
        `UPDATE po_lines
       SET actual_unit_price=$1::NUMERIC,
           total_price = CASE WHEN $1::NUMERIC IS NOT NULL THEN qty_ordered * $1::NUMERIC ELSE qty_ordered * unit_price END
       WHERE id=$2
       RETURNING id, actual_unit_price, total_price`,
        [actual_unit_price ?? null, lineId],
      )
      // Recalculate PO-level totals
      await query(
        `UPDATE purchase_orders
       SET subtotal=(SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1),
           total_amount=(SELECT COALESCE(SUM(total_price),0) FROM po_lines WHERE po_id=$1),
           updated_at=NOW()
       WHERE id=$1`,
        [id],
      )
      sendOk(res, result.rows[0])
    } catch (err) {
      handleError(res, err)
    }
  },
)
