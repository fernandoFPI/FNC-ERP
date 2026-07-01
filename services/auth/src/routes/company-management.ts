import { Router, type IRouter, type Request, type Response } from 'express'
import { query, withSystemTransaction } from '@fnc-erp/db'
import { requireAuth, requireRole } from '@fnc-erp/auth'
import { logAudit } from '@fnc-erp/audit'
import { createServiceLogger } from '@fnc-erp/logger'
import { sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const companyManagementRouter: IRouter = Router()

const log = createServiceLogger('company-management')

function isAdminOrOwn(req: Request, companyId: string): boolean {
  return req.auth!.role === 'system_admin' || req.auth!.companyId === companyId
}

// ── GET /auth/companies ────────────────────────────────────────────────────────

companyManagementRouter.get(
  '/',
  requireAuth(),
  requireRole('system_admin'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await query(
        `SELECT
           c.*,
           sc.fiscal_year_start_month,
           sc.fiscal_year_start_day,
           sc.default_currency,
           sc.default_payment_terms_days,
           sc.setup_completed AS config_setup_completed,
           COUNT(DISTINCT ucr.user_id) AS user_count
         FROM companies c
         LEFT JOIN system_configuration sc ON sc.company_id = c.id
         LEFT JOIN user_company_roles ucr ON ucr.company_id = c.id AND ucr.is_active = true
         GROUP BY c.id, sc.id
         ORDER BY c.name`,
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list companies', err)
    }
  },
)

// ── GET /auth/companies/:id ────────────────────────────────────────────────────

companyManagementRouter.get(
  '/:id',
  requireAuth(),
  requirePermission('admin.companies.view', 'view'),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdminOrOwn(req, req.params['id'] as string)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied')
      return
    }
    try {
      const result = await query(
        `SELECT c.*, sc.*
         FROM companies c
         LEFT JOIN system_configuration sc ON sc.company_id = c.id
         WHERE c.id = $1`,
        [req.params['id'] as string],
      )
      if (!result.rows[0]) { sendError(res, 404, 'NOT_FOUND', 'Company not found'); return }
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch company', err)
    }
  },
)

// ── POST /auth/companies ───────────────────────────────────────────────────────

companyManagementRouter.post(
  '/',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.companies.admin', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const {
      name, legal_name,
      country_code = 'IQ',
      city, address,
      phone, email, website,
      registration_number, vat_number,
      functional_currency = 'IQD',
      bank_name, bank_account, bank_iban, bank_swift,
      interco_transfer_pricing_method = 'avco',
    } = req.body as Record<string, string>

    if (!name || !legal_name) {
      sendError(res, 400, 'MISSING_FIELDS', 'name and legal_name are required')
      return
    }

    try {
      const companyId = await withSystemTransaction(async (client) => {
        const company = await client.query(
          `INSERT INTO companies
             (name, legal_name, country_code, currency_code,
              city, address, phone, email, website,
              registration_number, vat_number,
              bank_name, bank_account, bank_iban, bank_swift,
              interco_transfer_pricing_method, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true)
           RETURNING *`,
          [
            name, legal_name, country_code, functional_currency,
            city ?? null, address ?? null, phone ?? null, email ?? null, website ?? null,
            registration_number ?? null, vat_number ?? null,
            bank_name ?? null, bank_account ?? null, bank_iban ?? null, bank_swift ?? null,
            interco_transfer_pricing_method,
          ],
        )

        const cid: string = company.rows[0]?.['id']

        // Default system configuration
        await client.query(
          `INSERT INTO system_configuration (company_id, default_currency) VALUES ($1, $2)`,
          [cid, functional_currency],
        )

        // Default stock locations
        const defaultLocations = [
          { name: `${name} — Main Warehouse`, code: 'MAIN-WH', type: 'warehouse' },
          { name: `${name} — Virtual In`,     code: 'VIRTUAL-IN',  type: 'virtual_in' },
          { name: `${name} — Virtual Out`,    code: 'VIRTUAL-OUT', type: 'virtual_out' },
        ]
        for (const loc of defaultLocations) {
          await client.query(
            `INSERT INTO stock_locations (company_id, name, code, type, is_active)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (company_id, code) DO NOTHING`,
            [cid, loc.name, loc.code, loc.type],
          )
        }

        // Accounting periods for current year
        const currentYear = new Date().getFullYear()
        for (let month = 1; month <= 12; month++) {
          const startDate = new Date(currentYear, month - 1, 1)
          const endDate   = new Date(currentYear, month, 0)
          const monthName = startDate.toLocaleString('en', { month: 'long' })

          await client.query(
            `INSERT INTO accounting_periods (company_id, name, start_date, end_date, status)
             VALUES ($1, $2, $3, $4, 'open')
             ON CONFLICT (company_id, start_date) DO NOTHING`,
            [
              cid,
              `${monthName} ${currentYear}`,
              startDate.toISOString().split('T')[0],
              endDate.toISOString().split('T')[0],
            ],
          )
        }

        await logAudit({
          userId: req.auth!.userId,
          companyId: undefined,
          action: 'COMPANY_CREATED',
          tableName: 'companies',
          recordId: cid,
          newValues: { name, legal_name, country_code },
          ipAddress: req.ip ?? undefined,
          userAgent: String(req.headers['user-agent'] ?? ''),
          client,
        })

        log.info({ companyId: cid, name, createdBy: req.auth!.userId }, 'company created')
        return cid
      })

      const company = await query(`SELECT * FROM companies WHERE id = $1`, [companyId])
      res.status(201).json({ success: true, data: company.rows[0] })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create company', err)
    }
  },
)

// ── PUT /auth/companies/:id ────────────────────────────────────────────────────

companyManagementRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('admin.companies.admin', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdminOrOwn(req, req.params['id'] as string)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied')
      return
    }

    const {
      name, legal_name, country_code, city, address,
      phone, email, website, registration_number, vat_number,
      bank_name, bank_account, bank_iban, bank_swift,
      interco_transfer_pricing_method, interco_cost_plus_markup_pct,
      is_active,
    } = req.body as Record<string, unknown>

    try {
      await withSystemTransaction(async (client) => {
        await client.query(
          `UPDATE companies SET
             name                            = COALESCE($1,  name),
             legal_name                      = COALESCE($2,  legal_name),
             country_code                    = COALESCE($3,  country_code),
             city                            = COALESCE($4,  city),
             address                         = COALESCE($5,  address),
             phone                           = COALESCE($6,  phone),
             email                           = COALESCE($7,  email),
             website                         = COALESCE($8,  website),
             registration_number             = COALESCE($9,  registration_number),
             vat_number                      = COALESCE($10, vat_number),
             bank_name                       = COALESCE($11, bank_name),
             bank_account                    = COALESCE($12, bank_account),
             bank_iban                       = COALESCE($13, bank_iban),
             bank_swift                      = COALESCE($14, bank_swift),
             interco_transfer_pricing_method = COALESCE($15, interco_transfer_pricing_method),
             interco_cost_plus_markup_pct    = COALESCE($16, interco_cost_plus_markup_pct),
             is_active                       = COALESCE($17, is_active),
             updated_at                      = NOW()
           WHERE id = $18`,
          [
            name, legal_name, country_code, city, address,
            phone, email, website, registration_number, vat_number,
            bank_name, bank_account, bank_iban, bank_swift,
            interco_transfer_pricing_method, interco_cost_plus_markup_pct,
            is_active, req.params['id'],
          ],
        )

        await logAudit({
          userId: req.auth!.userId,
          companyId: req.params['id'] as string,
          action: 'COMPANY_UPDATED',
          tableName: 'companies',
          recordId: req.params['id'] as string,
          newValues: req.body as Record<string, unknown>,
          client,
        })
      })

      res.json({ success: true, data: { message: 'Company updated' } })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update company', err)
    }
  },
)

// ── PUT /auth/companies/:id/configuration ──────────────────────────────────────

companyManagementRouter.put(
  '/:id/configuration',
  requireAuth(),
  requirePermission('admin.companies.admin', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const role = req.auth!.role
    if (role !== 'system_admin' && role !== 'company_admin') {
      sendError(res, 403, 'FORBIDDEN', 'Company admin or above required')
      return
    }
    if (role === 'company_admin' && req.auth!.companyId !== req.params['id']) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied')
      return
    }

    const {
      fiscal_year_start_month, fiscal_year_start_day,
      default_currency, default_payment_terms_days, default_po_currency,
      income_tax_enabled, social_security_rate, employer_social_security_rate,
      default_wht_rate,
      company_email_from, company_email_signature,
    } = req.body as Record<string, unknown>

    try {
      // Ensure a config row exists
      await query(
        `INSERT INTO system_configuration (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`,
        [req.params['id'] as string],
      )

      await query(
        `UPDATE system_configuration SET
           fiscal_year_start_month       = COALESCE($1,  fiscal_year_start_month),
           fiscal_year_start_day         = COALESCE($2,  fiscal_year_start_day),
           default_currency              = COALESCE($3,  default_currency),
           default_payment_terms_days    = COALESCE($4,  default_payment_terms_days),
           default_po_currency           = COALESCE($5,  default_po_currency),
           income_tax_enabled            = COALESCE($6,  income_tax_enabled),
           social_security_rate          = COALESCE($7,  social_security_rate),
           employer_social_security_rate = COALESCE($8,  employer_social_security_rate),
           default_wht_rate              = COALESCE($9,  default_wht_rate),
           company_email_from            = COALESCE($10, company_email_from),
           company_email_signature       = COALESCE($11, company_email_signature),
           updated_at                    = NOW()
         WHERE company_id = $12`,
        [
          fiscal_year_start_month, fiscal_year_start_day,
          default_currency, default_payment_terms_days, default_po_currency,
          income_tax_enabled, social_security_rate, employer_social_security_rate,
          default_wht_rate,
          company_email_from, company_email_signature,
          req.params['id'],
        ],
      )

      await logAudit({
        userId: req.auth!.userId,
        companyId: req.params['id'] as string,
        action: 'COMPANY_CONFIGURATION_UPDATED',
        tableName: 'system_configuration',
        recordId: req.params['id'] as string,
        newValues: req.body as Record<string, unknown>,
        ipAddress: req.ip ?? undefined,
        userAgent: String(req.headers['user-agent'] ?? ''),
      })

      res.json({ success: true, data: { message: 'Configuration updated' } })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update configuration', err)
    }
  },
)

// ── GET /auth/companies/:id/users ──────────────────────────────────────────────

companyManagementRouter.get(
  '/:id/users',
  requireAuth(),
  requirePermission('admin.companies.view', 'view'),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdminOrOwn(req, req.params['id'] as string)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied')
      return
    }
    try {
      const result = await query(
        `SELECT DISTINCT
           u.id, u.email, u.is_active, u.last_login_at,
           json_agg(
             json_build_object(
               'id',       ucr.id,
               'role',     ucr.role,
               'module',   ucr.module,
               'isActive', ucr.is_active
             )
           ) FILTER (WHERE ucr.company_id = $1) AS roles
         FROM users u
         JOIN user_company_roles ucr ON ucr.user_id = u.id
         WHERE ucr.company_id = $1
         GROUP BY u.id
         ORDER BY u.email`,
        [req.params['id'] as string],
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list company users', err)
    }
  },
)
