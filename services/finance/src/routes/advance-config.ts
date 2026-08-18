import { Router } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

// Settings for the two account-auto-resolution defaults used by
// employee-advances.ts's resolveAdvanceAccounts: which cash account each
// currency draws from, and the parent account new per-employee advance
// sub-accounts get created under. Kept in its own router (rather than
// folded into accounts.ts) so its literal routes never risk being shadowed
// by accounts.ts's unconstrained GET /:id.
export const advanceConfigRouter: import('express').Router = Router()

// ─── Default cash accounts (one per currency) ───────────────────────────────

advanceConfigRouter.get(
  '/default-cash-accounts',
  requirePermission('finance.accounts.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT dca.*, coa.code AS account_code, coa.name AS account_name
         FROM company_default_cash_accounts dca
         JOIN chart_of_accounts coa ON coa.id = dca.account_id
         WHERE dca.company_id=$1 ORDER BY dca.currency_code`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load default cash accounts', err)
    }
  },
)

const defaultCashAccountSchema = z.object({
  currency_code: z.string().length(3),
  account_id: z.string().uuid(),
})

advanceConfigRouter.post(
  '/default-cash-accounts',
  requirePermission('finance.accounts.edit', 'edit'),
  async (req, res) => {
    try {
      const d = defaultCashAccountSchema.parse(req.body)
      const acct = await query(`SELECT id FROM chart_of_accounts WHERE id=$1 AND company_id=$2`, [
        d.account_id,
        req.auth!.companyId,
      ])
      if (!acct.rows[0]) {
        sendError(res, 400, 'INVALID_ACCOUNT', 'Account not found in this company')
        return
      }
      const r = await query(
        `INSERT INTO company_default_cash_accounts (company_id, currency_code, account_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (company_id, currency_code) DO UPDATE SET account_id=$3, updated_at=NOW()
         RETURNING *`,
        [req.auth!.companyId, d.currency_code.toUpperCase(), d.account_id],
      )
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'company_default_cash_accounts',
        recordId: r.rows[0]!['id'] as string,
        newValues: d,
      })
      sendOk(res, r.rows[0], 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to set default cash account', err)
    }
  },
)

advanceConfigRouter.delete(
  '/default-cash-accounts/:id',
  requirePermission('finance.accounts.edit', 'edit'),
  async (req, res) => {
    try {
      const r = await query(
        `DELETE FROM company_default_cash_accounts WHERE id=$1 AND company_id=$2 RETURNING id`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Default cash account not found')
        return
      }
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'DELETE',
        tableName: 'company_default_cash_accounts',
        recordId: req.params['id']!,
      })
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete default cash account', err)
    }
  },
)

// ─── Employee Advances parent account ───────────────────────────────────────

advanceConfigRouter.get(
  '/parent-account',
  requirePermission('finance.accounts.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT sc.advance_control_parent_account_id, coa.code AS account_code, coa.name AS account_name
         FROM system_configuration sc
         LEFT JOIN chart_of_accounts coa ON coa.id = sc.advance_control_parent_account_id
         WHERE sc.company_id=$1`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows[0] ?? { advance_control_parent_account_id: null })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load parent account setting', err)
    }
  },
)

const parentAccountSchema = z.object({ account_id: z.string().uuid() })

advanceConfigRouter.put(
  '/parent-account',
  requirePermission('finance.accounts.edit', 'edit'),
  async (req, res) => {
    try {
      const d = parentAccountSchema.parse(req.body)
      const acct = await query(`SELECT id FROM chart_of_accounts WHERE id=$1 AND company_id=$2`, [
        d.account_id,
        req.auth!.companyId,
      ])
      if (!acct.rows[0]) {
        sendError(res, 400, 'INVALID_ACCOUNT', 'Account not found in this company')
        return
      }
      await query(
        `INSERT INTO system_configuration (company_id, advance_control_parent_account_id)
         VALUES ($1,$2)
         ON CONFLICT (company_id) DO UPDATE SET advance_control_parent_account_id=$2, updated_at=NOW()`,
        [req.auth!.companyId, d.account_id],
      )
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'system_configuration',
        recordId: req.auth!.companyId,
        newValues: d,
      })
      sendOk(res, { advance_control_parent_account_id: d.account_id })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to set parent account', err)
    }
  },
)

// ─── Resolve GL account codes for a Payment Voucher's linked journal ───────
//
// Given a journal entry, tells the Payment Voucher form whether it's an
// advance-settlement journal and, if so, the employee's own advance GL
// account code (voucher line) and the configured parent account's code
// (voucher header) — the same two accounts already resolved and stored by
// resolveAdvanceAccounts when the advance was created, just read back by
// their codes here rather than re-resolved. Returns null (not an error)
// for any non-advance-settlement journal, since most vouchers are
// ordinary vendor payments with nothing to resolve here.

advanceConfigRouter.get(
  '/settlement-account-codes',
  requirePermission('finance.ap.edit', 'edit'),
  async (req, res) => {
    try {
      const journalId = req.query['journal_id'] as string | undefined
      if (!journalId) {
        sendError(res, 400, 'MISSING_JOURNAL_ID', 'journal_id is required')
        return
      }
      const je = await query(
        `SELECT source_type, source_id FROM journal_entries WHERE id=$1 AND company_id=$2`,
        [journalId, req.auth!.companyId],
      )
      if (!je.rows[0] || je.rows[0]['source_type'] !== 'advance_settlement') {
        sendOk(res, null)
        return
      }
      const settlement = await query(
        `SELECT employee_id FROM advance_settlements WHERE id=$1 AND company_id=$2`,
        [je.rows[0]['source_id'], req.auth!.companyId],
      )
      if (!settlement.rows[0]) {
        sendOk(res, null)
        return
      }
      const codes = await query(
        `SELECT emp_coa.code AS employee_account_code, parent_coa.code AS parent_account_code
         FROM employees e
         LEFT JOIN chart_of_accounts emp_coa ON emp_coa.id = e.advance_control_account_id
         LEFT JOIN system_configuration sc ON sc.company_id = e.company_id
         LEFT JOIN chart_of_accounts parent_coa ON parent_coa.id = sc.advance_control_parent_account_id
         WHERE e.id=$1 AND e.company_id=$2`,
        [settlement.rows[0]['employee_id'], req.auth!.companyId],
      )
      sendOk(res, {
        employeeAccountCode:
          (codes.rows[0]?.['employee_account_code'] as string | undefined) ?? null,
        parentAccountCode: (codes.rows[0]?.['parent_account_code'] as string | undefined) ?? null,
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to resolve settlement account codes', err)
    }
  },
)
