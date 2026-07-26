import { Router, type IRouter } from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { pool } from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'
import type { Request, Response } from 'express'

const log = logger.child({ module: 'search' })

export const searchRouter: IRouter = Router()

const LIMIT = 4

interface SearchItem {
  id: string
  title: string
  subtitle: string
  meta: string
  status: string
  url: string
  type: string
}

interface SearchGroup {
  type: string
  label: string
  items: SearchItem[]
}

function fmt(n: number | string | null, currency: string | null): string {
  if (n == null) return ''
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return ''
  return `${currency ?? ''} ${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`.trim()
}

// GET /api/v1/search?q=<query>
searchRouter.get('/', requireAuth(), async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (q.length < 2) {
    res.json({ groups: [] })
    return
  }

  const companyId = req.auth!.companyId
  const pattern = `%${q}%`

  try {
    const [pos, projects, employees, vendors, invoices, rentals] = await Promise.all([
      // Purchase Orders
      pool.query<{
        id: string
        po_number: string
        vendor_name: string
        status: string
        total_amount: string
        currency_code: string
      }>(
        `
        SELECT po.id, po.po_number, v.name AS vendor_name, po.status,
               po.total_amount, po.currency_code
        FROM purchase_orders po
        LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE po.company_id = $1
          AND (po.po_number ILIKE $2 OR v.name ILIKE $2)
          AND po.status != 'cancelled'
        ORDER BY po.created_at DESC
        LIMIT $3
      `,
        [companyId, pattern, LIMIT],
      ),

      // Projects
      pool.query<{
        id: string
        name: string
        code: string
        status: string
        client_name: string | null
      }>(
        `
        SELECT id, name, code, status, client_name
        FROM projects
        WHERE company_id = $1
          AND (name ILIKE $2 OR code ILIKE $2 OR client_name ILIKE $2)
        ORDER BY created_at DESC
        LIMIT $3
      `,
        [companyId, pattern, LIMIT],
      ),

      // Employees
      pool.query<{
        id: string
        first_name: string
        last_name: string
        employee_number: string | null
        job_title: string | null
        department_name: string | null
      }>(
        `
        SELECT e.id, e.first_name, e.last_name, e.employee_number, e.job_title,
               d.name AS department_name
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.company_id = $1
          AND (e.first_name ILIKE $2 OR e.last_name ILIKE $2
            OR (e.first_name || ' ' || e.last_name) ILIKE $2
            OR e.employee_number ILIKE $2)
        ORDER BY e.last_name, e.first_name
        LIMIT $3
      `,
        [companyId, pattern, LIMIT],
      ),

      // Vendors
      pool.query<{
        id: string
        name: string
        city: string | null
        is_active: boolean
      }>(
        `
        SELECT id, name, city, is_active
        FROM vendors
        WHERE company_id = $1
          AND name ILIKE $2
        ORDER BY name
        LIMIT $3
      `,
        [companyId, pattern, LIMIT],
      ),

      // Project Invoices
      pool.query<{
        id: string
        invoice_number: string
        status: string
        net_payable: string
        currency_code: string
        client_name: string | null
      }>(
        `
        SELECT pi.id, pi.invoice_number, pi.status,
               pi.net_payable, pi.currency_code, pc.client_name
        FROM project_invoices pi
        LEFT JOIN project_contracts pc ON pc.id = pi.contract_id
        WHERE pi.company_id = $1
          AND (pi.invoice_number ILIKE $2 OR pc.client_name ILIKE $2)
        ORDER BY pi.created_at DESC
        LIMIT $3
      `,
        [companyId, pattern, LIMIT],
      ),

      // Rental Contracts
      pool.query<{
        id: string
        contract_number: string
        client_name: string | null
        status: string
        rate_amount: string
        currency_code: string
      }>(
        `
        SELECT id, contract_number, client_name, status, rate_amount, currency_code
        FROM rental_contracts
        WHERE company_id = $1
          AND (contract_number ILIKE $2 OR client_name ILIKE $2)
        ORDER BY created_at DESC
        LIMIT $3
      `,
        [companyId, pattern, LIMIT],
      ),
    ])

    const groups: SearchGroup[] = []

    if (pos.rows.length > 0) {
      groups.push({
        type: 'purchase_order',
        label: 'Purchase Orders',
        items: pos.rows.map((r) => ({
          id: r.id,
          type: 'purchase_order',
          title: r.po_number,
          subtitle: r.vendor_name ?? '',
          meta: fmt(r.total_amount, r.currency_code),
          status: r.status.replace(/_/g, ' '),
          url: `/procurement/purchase-orders/${r.id}`,
        })),
      })
    }

    if (projects.rows.length > 0) {
      groups.push({
        type: 'project',
        label: 'Projects',
        items: projects.rows.map((r) => ({
          id: r.id,
          type: 'project',
          title: r.name,
          subtitle: r.code + (r.client_name ? ` · ${r.client_name}` : ''),
          meta: '',
          status: r.status,
          url: `/projects/${r.id}`,
        })),
      })
    }

    if (employees.rows.length > 0) {
      groups.push({
        type: 'employee',
        label: 'Employees',
        items: employees.rows.map((r) => ({
          id: r.id,
          type: 'employee',
          title: `${r.first_name} ${r.last_name}`,
          subtitle: [r.job_title, r.department_name].filter(Boolean).join(' · '),
          meta: r.employee_number ?? '',
          status: '',
          url: `/hr/employees/${r.id}`,
        })),
      })
    }

    if (vendors.rows.length > 0) {
      groups.push({
        type: 'vendor',
        label: 'Vendors',
        items: vendors.rows.map((r) => ({
          id: r.id,
          type: 'vendor',
          title: r.name,
          subtitle: r.city ?? '',
          meta: r.is_active ? '' : 'Inactive',
          status: '',
          url: `/procurement/vendors/${r.id}`,
        })),
      })
    }

    if (invoices.rows.length > 0) {
      groups.push({
        type: 'project_invoice',
        label: 'Project Invoices',
        items: invoices.rows.map((r) => ({
          id: r.id,
          type: 'project_invoice',
          title: r.invoice_number,
          subtitle: r.client_name ?? '',
          meta: fmt(r.net_payable, r.currency_code),
          status: r.status.replace(/_/g, ' '),
          url: `/projects/invoices/${r.id}`,
        })),
      })
    }

    if (rentals.rows.length > 0) {
      groups.push({
        type: 'rental_contract',
        label: 'Rental Contracts',
        items: rentals.rows.map((r) => ({
          id: r.id,
          type: 'rental_contract',
          title: r.contract_number,
          subtitle: r.client_name ?? '',
          meta: fmt(r.rate_amount, r.currency_code),
          status: r.status,
          url: `/rental/contracts/${r.id}`,
        })),
      })
    }

    res.json({ groups })
  } catch (err) {
    log.error({ err, q }, 'search failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})
