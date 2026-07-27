import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const revaluationRouter: import('express').Router = Router()

// ─── List runs ────────────────────────────────────────────────────────────────

revaluationRouter.get(
  '/',
  requirePermission('finance.revaluation.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT rv.*, COUNT(rl.id)::INT AS line_count
       FROM fx_revaluation_runs rv
       LEFT JOIN fx_revaluation_lines rl ON rl.run_id = rv.id
       WHERE rv.company_id = $1
       GROUP BY rv.id
       ORDER BY rv.run_date DESC`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load revaluation runs', err)
    }
  },
)

// ─── Get run with lines ───────────────────────────────────────────────────────

revaluationRouter.get(
  '/:id',
  requirePermission('finance.revaluation.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(`SELECT * FROM fx_revaluation_runs WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Revaluation run not found')
        return
      }
      const lines = await query(
        `SELECT rl.*, a.code AS account_code, a.name AS account_name
       FROM fx_revaluation_lines rl
       JOIN chart_of_accounts a ON a.id = rl.account_id
       WHERE rl.run_id = $1
       ORDER BY ABS(rl.gain_loss) DESC`,
        [req.params['id']],
      )
      sendOk(res, { ...r.rows[0], lines: lines.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load revaluation run', err)
    }
  },
)

// ─── Compute (preview) revaluation ───────────────────────────────────────────

revaluationRouter.post(
  '/compute',
  requirePermission('finance.revaluation.view', 'view'),
  async (req, res) => {
    const schema = z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/),
      run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      functional_currency: z.string().length(3).default('IQD'),
    })
    try {
      const { period, run_date, functional_currency } = schema.parse(req.body)

      // Find all accounts with non-zero balances in foreign currencies (monetary accounts)
      const balancesRes = await query(
        `SELECT
         jl.account_id,
         jl.currency_code,
         a.code AS account_code,
         a.name AS account_name,
         a.account_type,
         SUM(jl.debit - jl.credit) AS balance_fc
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       JOIN chart_of_accounts a ON a.id = jl.account_id
       WHERE je.company_id  = $1
         AND jl.currency_code != $2
         AND a.account_type IN ('asset','liability')
         AND TO_CHAR(je.entry_date, 'YYYY-MM') <= $3
       GROUP BY jl.account_id, jl.currency_code, a.code, a.name, a.account_type
       HAVING SUM(jl.debit - jl.credit) != 0`,
        [req.auth!.companyId, functional_currency, period],
      )

      const lines = []
      for (const row of balancesRes.rows) {
        const rateRes = await query(
          `SELECT rate FROM fx_rates
         WHERE from_currency=$1 AND to_currency=$2
           AND rate_date <= $3
         ORDER BY rate_date DESC LIMIT 1`,
          [row['currency_code'], functional_currency, run_date],
        )
        const rate = rateRes.rows[0] ? Number(rateRes.rows[0]['rate']) : 1

        // Get existing functional-currency balance from journal lines for this account
        const fcBalRes = await query(
          `SELECT COALESCE(SUM(debit - credit), 0) AS balance_lc
         FROM journal_lines
         WHERE account_id = $1 AND company_id = $2
           AND TO_CHAR(created_at,'YYYY-MM') <= $3`,
          [row['account_id'], req.auth!.companyId, period],
        )
        const balanceFC = Number(row['balance_fc'])
        const revaluedLC = Math.round(balanceFC * rate * 100) / 100
        const currentLC = Number(fcBalRes.rows[0]!['balance_lc'])
        const gainLoss = Math.round((revaluedLC - currentLC) * 100) / 100

        if (gainLoss !== 0) {
          lines.push({
            account_id: row['account_id'],
            account_code: row['account_code'],
            account_name: row['account_name'],
            account_type: row['account_type'],
            currency_code: row['currency_code'],
            original_balance: currentLC,
            fx_rate_used: rate,
            revalued_balance: revaluedLC,
            gain_loss: gainLoss,
          })
        }
      }

      const totalGainLoss = lines.reduce((s, l) => s + l.gain_loss, 0)
      sendOk(res, { period, run_date, functional_currency, lines, total_gain_loss: totalGainLoss })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to compute revaluation', err)
    }
  },
)

// ─── Post revaluation run ─────────────────────────────────────────────────────

revaluationRouter.post(
  '/post',
  requirePermission('finance.revaluation.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/),
      run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      functional_currency: z.string().length(3).default('IQD'),
      gain_account_id: z.string().uuid(),
      loss_account_id: z.string().uuid(),
      lines: z
        .array(
          z.object({
            account_id: z.string().uuid(),
            currency_code: z.string().length(3),
            original_balance: z.coerce.number(),
            fx_rate_used: z.coerce.number(),
            revalued_balance: z.coerce.number(),
            gain_loss: z.coerce.number(),
          }),
        )
        .min(1),
      notes: z.string().optional(),
    })
    try {
      const d = schema.parse(req.body)
      const totalGainLoss = d.lines.reduce((s, l) => s + l.gain_loss, 0)

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          // Create journal entry
          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, entry_date, reference, description, currency_code, status, created_by)
           VALUES ($1,$2,$3,$4,$5,'posted',$6) RETURNING id`,
            [
              req.auth!.companyId,
              d.run_date,
              `REVAL-${d.period}`,
              `FX Revaluation ${d.period}`,
              d.functional_currency,
              req.auth!.userId,
            ],
          )
          const jeId = jeRes.rows[0]!.id as string

          // Post a journal line for each account
          for (const line of d.lines) {
            const isGain = line.gain_loss > 0
            const absGL = Math.abs(line.gain_loss)

            if (isGain) {
              // DR asset (or CR liability) → CR Unrealized FX Gain
              await client.query(
                `INSERT INTO journal_lines (journal_entry_id, company_id, account_id, currency_code, debit, credit, description)
               VALUES ($1,$2,$3,$4,$5,0,$6),
                      ($1,$2,$7,$4,0,$5,$6)`,
                [
                  jeId,
                  req.auth!.companyId,
                  line.account_id,
                  d.functional_currency,
                  absGL,
                  `FX Revaluation ${d.period}`,
                  d.gain_account_id,
                ],
              )
            } else {
              // CR asset (or DR liability) → DR Unrealized FX Loss
              await client.query(
                `INSERT INTO journal_lines (journal_entry_id, company_id, account_id, currency_code, debit, credit, description)
               VALUES ($1,$2,$3,$4,0,$5,$6),
                      ($1,$2,$7,$4,$5,0,$6)`,
                [
                  jeId,
                  req.auth!.companyId,
                  line.account_id,
                  d.functional_currency,
                  absGL,
                  `FX Revaluation ${d.period}`,
                  d.loss_account_id,
                ],
              )
            }
          }

          // Create run record
          const runRes = await client.query(
            `INSERT INTO fx_revaluation_runs (company_id, run_date, period, status, total_gain_loss, journal_entry_id, notes, created_by)
           VALUES ($1,$2,$3,'posted',$4,$5,$6,$7) RETURNING *`,
            [
              req.auth!.companyId,
              d.run_date,
              d.period,
              totalGainLoss,
              jeId,
              d.notes ?? null,
              req.auth!.userId,
            ],
          )
          const run = runRes.rows[0]!

          // Create line records
          for (const line of d.lines) {
            await client.query(
              `INSERT INTO fx_revaluation_lines (run_id, company_id, account_id, currency_code, original_balance, fx_rate_used, revalued_balance, gain_loss)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                run.id,
                req.auth!.companyId,
                line.account_id,
                line.currency_code,
                line.original_balance,
                line.fx_rate_used,
                line.revalued_balance,
                line.gain_loss,
              ],
            )
          }

          return run
        },
      )

      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'INSERT',
        tableName: 'fx_revaluation_runs',
        recordId: result.id as string,
        newValues: { period: d.period, total_gain_loss: totalGainLoss },
      })
      sendOk(res, result, 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to post revaluation', err)
    }
  },
)

// ─── Reverse a posted run ─────────────────────────────────────────────────────

revaluationRouter.post(
  '/:id/reverse',
  requirePermission('finance.revaluation.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      reversal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().optional(),
    })
    try {
      const { reversal_date, notes } = schema.parse(req.body)
      const runRes = await query(
        `SELECT * FROM fx_revaluation_runs WHERE id=$1 AND company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!runRes.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Run not found')
        return
      }
      const run = runRes.rows[0]
      if (run['status'] !== 'posted') {
        sendError(res, 409, 'INVALID_STATUS', 'Only posted runs can be reversed')
        return
      }

      const linesRes = await query(`SELECT * FROM fx_revaluation_lines WHERE run_id=$1`, [
        req.params['id'],
      ])

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          // Create reversal JE (opposite of original)
          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, entry_date, reference, description, currency_code, status, created_by)
           VALUES ($1,$2,$3,$4,$5,'posted',$6) RETURNING id`,
            [
              req.auth!.companyId,
              reversal_date,
              `REVAL-REV-${run['period']}`,
              `Reversal: FX Revaluation ${run['period']}`,
              'IQD',
              req.auth!.userId,
            ],
          )
          const jeId = jeRes.rows[0]!.id as string

          // Flip each line
          for (const line of linesRes.rows) {
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id, company_id, account_id, currency_code, debit, credit, description)
             SELECT $1, company_id, account_id, currency_code, credit, debit, 'Reversal: ' || description
             FROM journal_lines WHERE journal_entry_id=$2 AND account_id=$3`,
              [jeId, run['journal_entry_id'], line['account_id']],
            )
          }

          await client.query(
            `UPDATE fx_revaluation_runs SET status='reversed', reversal_entry_id=$1 WHERE id=$2`,
            [jeId, req.params['id']],
          )
          return { reversed: true, reversal_entry_id: jeId }
        },
      )

      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reverse revaluation', err)
    }
  },
)
