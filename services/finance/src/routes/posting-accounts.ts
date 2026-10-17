import { Router } from 'express'
import { getAuth } from '@fnc-erp/auth'
import type { IRouter } from 'express'
import { z } from 'zod'
import {
  listCompanyPostingAccounts,
  upsertCompanyPostingAccount,
  deleteCompanyPostingAccount,
  POSTING_ACCOUNT_ROLES,
  type PostingAccountRole,
} from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

// G1/G2: the settings screen for company_posting_accounts (migration 303) —
// the per-company, optionally per-currency map that replaced every
// "guess a GL account by code prefix/exact code/name" producer. Seeded
// with nothing; this is how D1 actually gets filled in.
export const postingAccountsRouter: IRouter = Router()

const UpsertSchema = z.object({
  role: z.enum(POSTING_ACCOUNT_ROLES),
  currency_code: z.string().length(3).nullable().optional(),
  account_id: z.string().uuid(),
})

postingAccountsRouter.get(
  '/',
  requirePermission('finance.accounts.view', 'view'),
  async (req, res) => {
    try {
      const companyId = getAuth(req).companyId
      const rows = await listCompanyPostingAccounts(companyId)
      sendOk(res, rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch posting accounts', err)
    }
  },
)

postingAccountsRouter.get('/roles', requirePermission('finance.accounts.view', 'view'), (_req, res) => {
  sendOk(res, POSTING_ACCOUNT_ROLES)
})

postingAccountsRouter.put(
  '/',
  requirePermission('finance.accounts.edit', 'edit'),
  async (req, res) => {
    try {
      const parsed = UpsertSchema.safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
        return
      }
      const auth = getAuth(req)
      const { role, currency_code, account_id } = parsed.data
      const row = await upsertCompanyPostingAccount(
        auth.companyId,
        role as PostingAccountRole,
        currency_code ?? null,
        account_id,
        auth.userId,
      )
      await logAudit({
        companyId: auth.companyId,
        userId: auth.userId,
        action: 'UPSERT',
        tableName: 'company_posting_accounts',
        recordId: row.id,
        newValues: { ...row },
      })
      sendOk(res, row)
    } catch (err) {
      sendError(res, 400, 'VALIDATION_ERROR', (err as Error).message, err)
    }
  },
)

postingAccountsRouter.delete(
  '/:role',
  requirePermission('finance.accounts.edit', 'edit'),
  async (req, res) => {
    try {
      const auth = getAuth(req)
      const role = req.params['role'] as PostingAccountRole
      if (!POSTING_ACCOUNT_ROLES.includes(role)) {
        sendError(res, 400, 'VALIDATION_ERROR', `Unknown role '${role}'`)
        return
      }
      const currencyCode = (req.query['currency_code'] as string | undefined) ?? null
      await deleteCompanyPostingAccount(auth.companyId, role, currencyCode)
      await logAudit({
        companyId: auth.companyId,
        userId: auth.userId,
        action: 'DELETE',
        tableName: 'company_posting_accounts',
        oldValues: { role, currency_code: currencyCode },
      })
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete posting account', err)
    }
  },
)
