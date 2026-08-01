import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const bankRouter: import('express').Router = Router()

function round2(n: number) {
  return Math.round(n * 100) / 100
}

// ─── Company Bank Accounts (read-only, from existing bank_accounts table) ────

bankRouter.get(
  '/company-accounts',
  requirePermission('finance.bank.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT id, account_name AS name, bank_name, branch_code AS branch,
              account_number, iban, swift AS swift_code, currency_code
       FROM bank_accounts
       WHERE is_active = true
       ORDER BY account_name`,
        [],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load company bank accounts', err)
    }
  },
)

// ─── Bank Accounts ────────────────────────────────────────────────────────────

bankRouter.get('/accounts', requirePermission('finance.bank.view', 'view'), async (req, res) => {
  try {
    const r = await query(
      `SELECT ba.*,
              ca.name AS gl_account_name, ca.code AS gl_account_code,
              COUNT(DISTINCT bs.id) FILTER (WHERE bs.status != 'reconciled') AS pending_statements,
              MAX(bs.period) AS latest_period
       FROM recon_bank_accounts ba
       LEFT JOIN chart_of_accounts ca ON ca.id = ba.gl_account_id
       LEFT JOIN recon_statements bs ON bs.bank_account_id = ba.id
       WHERE ba.company_id = $1
       GROUP BY ba.id, ca.name, ca.code
       ORDER BY ba.is_active DESC, ba.name`,
      [req.auth!.companyId],
    )
    sendOk(res, r.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load bank accounts', err)
  }
})

bankRouter.post('/accounts', requirePermission('finance.bank.edit', 'edit'), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    account_number: z.string().optional(),
    bank_name: z.string().optional(),
    branch: z.string().optional(),
    swift_code: z.string().optional(),
    iban: z.string().optional(),
    currency_code: z.string().length(3).default('IQD'),
    gl_account_id: z.string().uuid().optional(),
    opening_balance: z.coerce.number().default(0),
    notes: z.string().optional(),
  })
  try {
    const d = schema.parse(req.body)
    const r = await query(
      `INSERT INTO recon_bank_accounts
         (company_id,name,account_number,bank_name,branch,swift_code,iban,currency_code,gl_account_id,opening_balance,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        req.auth!.companyId,
        d.name,
        d.account_number ?? null,
        d.bank_name ?? null,
        d.branch ?? null,
        d.swift_code ?? null,
        d.iban ?? null,
        d.currency_code,
        d.gl_account_id ?? null,
        d.opening_balance,
        d.notes ?? null,
      ],
    )
    await logAudit({
      companyId: req.auth!.companyId,
      userId: req.auth!.userId,
      action: 'INSERT',
      tableName: 'recon_bank_accounts',
      recordId: r.rows[0]!['id'] as string,
      newValues: d,
    })
    sendOk(res, r.rows[0], 201)
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      sendError(res, 409, 'DUPLICATE', 'Bank account name already exists')
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create bank account', err)
  }
})

bankRouter.get(
  '/accounts/:id',
  requirePermission('finance.bank.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT ba.*, ca.name AS gl_account_name, ca.code AS gl_account_code
       FROM recon_bank_accounts ba
       LEFT JOIN chart_of_accounts ca ON ca.id = ba.gl_account_id
       WHERE ba.id = $1 AND ba.company_id = $2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Bank account not found')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load bank account', err)
    }
  },
)

bankRouter.put(
  '/accounts/:id',
  requirePermission('finance.bank.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1).optional(),
      account_number: z.string().optional(),
      bank_name: z.string().optional(),
      branch: z.string().optional(),
      swift_code: z.string().optional(),
      iban: z.string().optional(),
      currency_code: z.string().length(3).optional(),
      gl_account_id: z.string().uuid().nullable().optional(),
      opening_balance: z.coerce.number().optional(),
      is_active: z.boolean().optional(),
      notes: z.string().optional(),
    })
    try {
      const d = schema.parse(req.body)
      const sets: string[] = []
      const vals: unknown[] = []
      let i = 1
      for (const [k, v] of Object.entries(d)) {
        if (v !== undefined) {
          sets.push(`${k} = $${i++}`)
          vals.push(v)
        }
      }
      if (!sets.length) {
        sendError(res, 400, 'NO_CHANGES', 'Nothing to update')
        return
      }
      sets.push(`updated_at = NOW()`)
      vals.push(req.params['id'], req.auth!.companyId)
      const r = await query(
        `UPDATE recon_bank_accounts SET ${sets.join(', ')} WHERE id = $${i++} AND company_id = $${i++} RETURNING *`,
        vals,
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Bank account not found')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update bank account', err)
    }
  },
)

// ─── Statements ───────────────────────────────────────────────────────────────

bankRouter.get(
  '/accounts/:accountId/statements',
  requirePermission('finance.bank.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT bs.*,
              COUNT(bsl.id) AS total_lines,
              COUNT(bsl.id) FILTER (WHERE bsl.is_reconciled) AS matched_lines
       FROM recon_statements bs
       LEFT JOIN recon_lines bsl ON bsl.statement_id = bs.id
       WHERE bs.bank_account_id = $1 AND bs.company_id = $2
       GROUP BY bs.id
       ORDER BY bs.period DESC`,
        [req.params['accountId'], req.auth!.companyId],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load statements', err)
    }
  },
)

bankRouter.post(
  '/accounts/:accountId/statements',
  requirePermission('finance.bank.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/),
      statement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      opening_balance: z.coerce.number(),
      closing_balance: z.coerce.number(),
      notes: z.string().optional(),
    })
    try {
      const d = schema.parse(req.body)
      const acct = await query(`SELECT id FROM recon_bank_accounts WHERE id=$1 AND company_id=$2`, [
        req.params['accountId'],
        req.auth!.companyId,
      ])
      if (!acct.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Bank account not found')
        return
      }
      const r = await query(
        `INSERT INTO recon_statements (company_id,bank_account_id,period,statement_date,opening_balance,closing_balance,notes,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          req.auth!.companyId,
          req.params['accountId'],
          d.period,
          d.statement_date,
          d.opening_balance,
          d.closing_balance,
          d.notes ?? null,
          req.auth!.userId,
        ],
      )
      sendOk(res, r.rows[0], 201)
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        sendError(res, 409, 'DUPLICATE', 'Statement for this period already exists')
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create statement', err)
    }
  },
)

// Get statement with lines and match status
bankRouter.get(
  '/statements/:id',
  requirePermission('finance.bank.view', 'view'),
  async (req, res) => {
    try {
      const stmtRes = await query(
        `SELECT bs.*, ba.name AS account_name, ba.account_number, ba.currency_code, ba.gl_account_id,
              ba.bank_name,
              COUNT(bsl.id) AS total_lines,
              COUNT(bsl.id) FILTER (WHERE bsl.is_reconciled) AS matched_lines
       FROM recon_statements bs
       JOIN recon_bank_accounts ba ON ba.id = bs.bank_account_id
       LEFT JOIN recon_lines bsl ON bsl.statement_id = bs.id
       WHERE bs.id = $1 AND bs.company_id = $2
       GROUP BY bs.id, ba.name, ba.account_number, ba.currency_code, ba.gl_account_id, ba.bank_name`,
        [req.params['id'], req.auth!.companyId],
      )
      const stmt = stmtRes.rows[0]
      if (!stmt) {
        sendError(res, 404, 'NOT_FOUND', 'Statement not found')
        return
      }

      const linesRes = await query(
        `SELECT bsl.*,
              json_agg(json_build_object(
                'id', brm.id,
                'journal_entry_id', brm.journal_entry_id,
                'journal_line_id', brm.journal_line_id,
                'match_type', brm.match_type,
                'je_reference', je.reference,
                'je_description', je.description
              )) FILTER (WHERE brm.id IS NOT NULL) AS matches
       FROM recon_lines bsl
       LEFT JOIN recon_matches brm ON brm.statement_line_id = bsl.id
       LEFT JOIN journal_entries je ON je.id = brm.journal_entry_id
       WHERE bsl.statement_id = $1
       GROUP BY bsl.id
       ORDER BY bsl.line_number, bsl.transaction_date`,
        [req.params['id']],
      )
      sendOk(res, { ...stmt, lines: linesRes.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load statement', err)
    }
  },
)

// ─── Statement Lines ──────────────────────────────────────────────────────────

bankRouter.post(
  '/statements/:id/lines',
  requirePermission('finance.bank.edit', 'edit'),
  async (req, res) => {
    const lineSchema = z.object({
      transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      value_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      description: z.string().min(1),
      reference: z.string().optional(),
      debit: z.coerce.number().min(0).default(0),
      credit: z.coerce.number().min(0).default(0),
      balance_after: z.coerce.number().optional(),
    })
    const schema = z.object({ lines: z.array(lineSchema).min(1) })
    try {
      const stmtRes = await query(
        `SELECT id, status FROM recon_statements WHERE id=$1 AND company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      const stmt = stmtRes.rows[0]
      if (!stmt) {
        sendError(res, 404, 'NOT_FOUND', 'Statement not found')
        return
      }
      if (stmt['status'] === 'reconciled') {
        sendError(res, 400, 'RECONCILED', 'Cannot add lines to a reconciled statement')
        return
      }

      const { lines } = schema.parse(req.body)
      const maxRes = await query(
        `SELECT COALESCE(MAX(line_number), 0) AS max FROM recon_lines WHERE statement_id=$1`,
        [req.params['id']],
      )
      let lineNum = Number(maxRes.rows[0]!['max'])

      const inserted = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const rows = []
          for (const line of lines) {
            lineNum++
            const r = await client.query(
              `INSERT INTO recon_lines
               (statement_id,company_id,line_number,transaction_date,value_date,description,reference,debit,credit,balance_after)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
              [
                req.params['id'],
                req.auth!.companyId,
                lineNum,
                line.transaction_date,
                line.value_date ?? null,
                line.description,
                line.reference ?? null,
                line.debit,
                line.credit,
                line.balance_after ?? null,
              ],
            )
            rows.push(r.rows[0])
          }
          await client.query(
            `UPDATE recon_statements SET status='in_progress', updated_at=NOW() WHERE id=$1 AND status='draft'`,
            [req.params['id']],
          )
          return rows
        },
      )
      sendOk(res, inserted, 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to add statement lines', err)
    }
  },
)

bankRouter.delete(
  '/lines/:id',
  requirePermission('finance.bank.edit', 'edit'),
  async (req, res) => {
    try {
      const r = await query(`SELECT is_reconciled FROM recon_lines WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Line not found')
        return
      }
      if (r.rows[0]['is_reconciled']) {
        sendError(res, 400, 'MATCHED', 'Cannot delete a matched line — unmatch it first')
        return
      }
      await query(`DELETE FROM recon_lines WHERE id=$1`, [req.params['id']])
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete line', err)
    }
  },
)

// ─── GL Entries (right panel) ─────────────────────────────────────────────────

bankRouter.get(
  '/statements/:id/gl-entries',
  requirePermission('finance.bank.view', 'view'),
  async (req, res) => {
    try {
      const stmtRes = await query(
        `SELECT bs.period, ba.gl_account_id
       FROM recon_statements bs
       JOIN recon_bank_accounts ba ON ba.id = bs.bank_account_id
       WHERE bs.id = $1 AND bs.company_id = $2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!stmtRes.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Statement not found')
        return
      }

      const { period, gl_account_id } = stmtRes.rows[0] as {
        period: string
        gl_account_id: string | null
      }
      if (!gl_account_id) {
        sendOk(res, [])
        return
      }

      const [year, month] = period.split('-').map(Number)
      const from = new Date(year!, month! - 2, 1).toISOString().slice(0, 10)
      const to = new Date(year!, month! + 1, 0).toISOString().slice(0, 10)

      const r = await query(
        `SELECT jl.id, jl.journal_entry_id, jl.description AS line_description,
              jl.debit, jl.credit,
              je.reference, je.description, je.entry_date, je.source_type
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.account_id = $1
         AND je.company_id = $2
         AND je.entry_date BETWEEN $3 AND $4
         AND je.status = 'posted'
         AND jl.id NOT IN (
           SELECT journal_line_id FROM recon_matches
           WHERE journal_line_id IS NOT NULL AND company_id = $2
         )
       ORDER BY je.entry_date, je.reference`,
        [gl_account_id, req.auth!.companyId, from, to],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load GL entries', err)
    }
  },
)

// ─── Auto-Match ───────────────────────────────────────────────────────────────

bankRouter.post(
  '/statements/:id/auto-match',
  requirePermission('finance.bank.edit', 'edit'),
  async (req, res) => {
    try {
      const stmtRes = await query(
        `SELECT bs.period, ba.gl_account_id
       FROM recon_statements bs
       JOIN recon_bank_accounts ba ON ba.id = bs.bank_account_id
       WHERE bs.id = $1 AND bs.company_id = $2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!stmtRes.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Statement not found')
        return
      }

      const { period, gl_account_id } = stmtRes.rows[0] as {
        period: string
        gl_account_id: string | null
      }
      if (!gl_account_id) {
        sendError(res, 400, 'NO_GL_ACCOUNT', 'Bank account has no GL account linked')
        return
      }

      const [year, month] = period.split('-').map(Number)
      const from = new Date(year!, month! - 2, 1).toISOString().slice(0, 10)
      const to = new Date(year!, month! + 1, 0).toISOString().slice(0, 10)

      const bankLines = await query(
        `SELECT id, transaction_date, debit, credit FROM recon_lines
       WHERE statement_id=$1 AND is_reconciled=false`,
        [req.params['id']],
      )

      const glLines = await query(
        `SELECT jl.id, jl.journal_entry_id, jl.debit, jl.credit, je.entry_date
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.account_id=$1 AND je.company_id=$2
         AND je.entry_date BETWEEN $3 AND $4 AND je.status='posted'
         AND jl.id NOT IN (
           SELECT journal_line_id FROM recon_matches
           WHERE journal_line_id IS NOT NULL AND company_id=$2
         )`,
        [gl_account_id, req.auth!.companyId, from, to],
      )

      let matched = 0
      const usedGl = new Set<string>()

      await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          for (const bLine of bankLines.rows) {
            const bankNet = round2(Number(bLine['credit']) - Number(bLine['debit']))
            const bDate = new Date(bLine['transaction_date'] as string)

            const glMatch = glLines.rows.find((gl) => {
              if (usedGl.has(gl['id'] as string)) return false
              const glNet = round2(Number(gl['debit']) - Number(gl['credit']))
              const daysDiff = Math.abs(
                (new Date(gl['entry_date'] as string).getTime() - bDate.getTime()) / 86400000,
              )
              return Math.abs(glNet - bankNet) < 0.01 && daysDiff <= 5
            })

            if (glMatch) {
              usedGl.add(glMatch['id'] as string)
              await client.query(
                `INSERT INTO recon_matches (company_id,statement_line_id,journal_line_id,journal_entry_id,match_type,matched_by)
               VALUES ($1,$2,$3,$4,'auto',$5)`,
                [
                  req.auth!.companyId,
                  bLine['id'],
                  glMatch['id'],
                  glMatch['journal_entry_id'],
                  req.auth!.userId,
                ],
              )
              await client.query(
                `UPDATE recon_lines SET is_reconciled=true, reconciled_at=NOW() WHERE id=$1`,
                [bLine['id']],
              )
              matched++
            }
          }
        },
      )
      sendOk(res, { matched })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to auto-match', err)
    }
  },
)

// ─── Manual Match ─────────────────────────────────────────────────────────────

bankRouter.post('/match', requirePermission('finance.bank.edit', 'edit'), async (req, res) => {
  const schema = z.object({
    statement_line_ids: z.array(z.string().uuid()).min(1),
    journal_line_ids: z.array(z.string().uuid()).min(1),
    notes: z.string().optional(),
  })
  try {
    const d = schema.parse(req.body)

    const lineCheck = await query(
      `SELECT COUNT(*) AS n FROM recon_lines WHERE id=ANY($1) AND company_id=$2 AND is_reconciled=false`,
      [d.statement_line_ids, req.auth!.companyId],
    )
    if (Number(lineCheck.rows[0]!['n']) !== d.statement_line_ids.length) {
      sendError(res, 400, 'INVALID_LINES', 'One or more bank lines are invalid or already matched')
      return
    }

    const result = await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
      async (client) => {
        const matches = []
        for (const lineId of d.statement_line_ids) {
          for (const jlId of d.journal_line_ids) {
            const jlRes = await client.query(
              `SELECT journal_entry_id FROM journal_lines WHERE id=$1`,
              [jlId],
            )
            const jeId = jlRes.rows[0]?.journal_entry_id as string | undefined
            const r = await client.query(
              `INSERT INTO recon_matches (company_id,statement_line_id,journal_line_id,journal_entry_id,match_type,notes,matched_by)
               VALUES ($1,$2,$3,$4,'manual',$5,$6) ON CONFLICT DO NOTHING RETURNING *`,
              [req.auth!.companyId, lineId, jlId, jeId ?? null, d.notes ?? null, req.auth!.userId],
            )
            if (r.rows[0]) matches.push(r.rows[0])
          }
          await client.query(
            `UPDATE recon_lines SET is_reconciled=true, reconciled_at=NOW() WHERE id=$1`,
            [lineId],
          )
        }
        return matches
      },
    )
    sendOk(res, { matches: result, matched_lines: d.statement_line_ids.length })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create match', err)
  }
})

// Unmatch a bank line
bankRouter.delete(
  '/match/line/:statementLineId',
  requirePermission('finance.bank.edit', 'edit'),
  async (req, res) => {
    try {
      const r = await query(`SELECT is_reconciled FROM recon_lines WHERE id=$1 AND company_id=$2`, [
        req.params['statementLineId'],
        req.auth!.companyId,
      ])
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Line not found')
        return
      }
      await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          await client.query(`DELETE FROM recon_matches WHERE statement_line_id=$1`, [
            req.params['statementLineId'],
          ])
          await client.query(
            `UPDATE recon_lines SET is_reconciled=false, reconciled_at=NULL WHERE id=$1`,
            [req.params['statementLineId']],
          )
        },
      )
      sendOk(res, { unmatched: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to unmatch', err)
    }
  },
)

// ─── Create Journal Entry from Bank Line ──────────────────────────────────────

bankRouter.post(
  '/lines/:id/create-entry',
  requirePermission('finance.bank.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      offset_account_id: z.string().uuid(),
      description: z.string().optional(),
    })
    try {
      const d = schema.parse(req.body)

      const lineRes = await query(
        `SELECT bsl.*, ba.gl_account_id, ba.currency_code
       FROM recon_lines bsl
       JOIN recon_statements bs ON bs.id = bsl.statement_id
       JOIN recon_bank_accounts ba ON ba.id = bs.bank_account_id
       WHERE bsl.id=$1 AND bsl.company_id=$2 AND bsl.is_reconciled=false`,
        [req.params['id'], req.auth!.companyId],
      )
      const line = lineRes.rows[0]
      if (!line) {
        sendError(res, 404, 'NOT_FOUND', 'Line not found or already matched')
        return
      }
      if (!line['gl_account_id']) {
        sendError(res, 400, 'NO_GL_ACCOUNT', 'Bank account has no GL account configured')
        return
      }

      const isCredit = Number(line['credit']) > 0
      const amount = isCredit ? Number(line['credit']) : Number(line['debit'])
      const desc = d.description ?? (line['description'] as string)
      const bankGlId = line['gl_account_id'] as string

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id,reference,description,entry_date,source_type,status,created_by)
           VALUES ($1,$2,$3,$4,'bank_entry','posted',$5) RETURNING id`,
            [
              req.auth!.companyId,
              `BANK-${(line['transaction_date'] as string).slice(0, 7)}`.slice(0, 50),
              desc,
              line['transaction_date'],
              req.auth!.userId,
            ],
          )
          const jeId = jeRes.rows[0]!.id as string

          if (isCredit) {
            // Money IN: DR bank, CR offset
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,$4,0,$4)`,
              [jeId, bankGlId, desc, amount],
            )
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,0,$4,$4)`,
              [jeId, d.offset_account_id, desc, amount],
            )
          } else {
            // Money OUT: DR offset, CR bank
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,$4,0,$4)`,
              [jeId, d.offset_account_id, desc, amount],
            )
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,0,$4,$4)`,
              [jeId, bankGlId, desc, amount],
            )
          }

          const jlRes = await client.query(
            `SELECT id FROM journal_lines WHERE journal_entry_id=$1 AND account_id=$2 LIMIT 1`,
            [jeId, bankGlId],
          )
          const jlId = jlRes.rows[0]?.id as string | undefined

          await client.query(
            `INSERT INTO recon_matches (company_id,statement_line_id,journal_line_id,journal_entry_id,match_type,matched_by)
           VALUES ($1,$2,$3,$4,'created',$5)`,
            [req.auth!.companyId, req.params['id'], jlId ?? null, jeId, req.auth!.userId],
          )
          await client.query(
            `UPDATE recon_lines SET is_reconciled=true, reconciled_at=NOW() WHERE id=$1`,
            [req.params['id']],
          )
          return { journal_entry_id: jeId }
        },
      )
      sendOk(res, result, 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create entry', err)
    }
  },
)

// ─── Finalize Reconciliation ──────────────────────────────────────────────────

bankRouter.post(
  '/statements/:id/finalize',
  requirePermission('finance.bank.edit', 'edit'),
  async (req, res) => {
    try {
      const stmtRes = await query(
        `SELECT bs.*,
              COUNT(bsl.id) AS total_lines,
              COUNT(bsl.id) FILTER (WHERE bsl.is_reconciled) AS matched_lines
       FROM recon_statements bs
       LEFT JOIN recon_lines bsl ON bsl.statement_id = bs.id
       WHERE bs.id=$1 AND bs.company_id=$2
       GROUP BY bs.id`,
        [req.params['id'], req.auth!.companyId],
      )
      const s = stmtRes.rows[0]
      if (!s) {
        sendError(res, 404, 'NOT_FOUND', 'Statement not found')
        return
      }
      if (s['status'] === 'reconciled') {
        sendError(res, 400, 'ALREADY_RECONCILED', 'Statement already reconciled')
        return
      }

      const total = Number(s['total_lines'])
      const matched = Number(s['matched_lines'])
      if (total > 0 && matched < total) {
        sendError(
          res,
          400,
          'UNMATCHED_LINES',
          `${total - matched} unmatched line(s) remaining — match or delete them first`,
        )
        return
      }

      const r = await query(
        `UPDATE recon_statements SET status='reconciled', reconciled_at=NOW(), reconciled_by=$1, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
        [req.auth!.userId, req.params['id']],
      )
      await query(
        `UPDATE recon_bank_accounts SET last_reconciled_date=$1, last_reconciled_balance=$2, updated_at=NOW() WHERE id=$3`,
        [
          r.rows[0]!['statement_date'],
          r.rows[0]!['closing_balance'],
          r.rows[0]!['bank_account_id'],
        ],
      )
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to finalize reconciliation', err)
    }
  },
)
