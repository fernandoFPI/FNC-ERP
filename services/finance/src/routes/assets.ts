import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const assetsRouter: IRouter = Router()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Generate full depreciation schedule lines in memory */
function buildSchedule(
  assetId: string,
  purchaseCost: number,
  salvageValue: number,
  usefulLifeMonths: number,
  method: 'straight_line' | 'declining_balance',
  decliningRate: number | null,
  activationDate: Date,
): Array<{
  assetId: string; period: string; periodDate: string
  depreciationAmount: number; accumulatedDepreciation: number; bookValueAfter: number
}> {
  const lines: ReturnType<typeof buildSchedule> = []
  let accum = 0
  let bookValue = purchaseCost
  const depreciableBase = purchaseCost - salvageValue
  const monthlySlAmount = round2(depreciableBase / usefulLifeMonths)

  for (let i = 0; i < usefulLifeMonths; i++) {
    const d = new Date(activationDate)
    d.setMonth(d.getMonth() + i)
    const year  = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const period = `${year}-${month}`
    const periodDate = `${year}-${month}-01`

    let depAmount: number
    if (method === 'straight_line') {
      const isLast = i === usefulLifeMonths - 1
      depAmount = isLast ? round2(depreciableBase - accum) : monthlySlAmount
    } else {
      // Declining balance — switch to straight-line when SL > DB
      const rate = (decliningRate ?? 2 / (usefulLifeMonths / 12)) / 12
      const dbAmount = round2(Math.max(bookValue - salvageValue, 0) * rate)
      const remainingMonths = usefulLifeMonths - i
      const slSwitch = round2(Math.max(bookValue - salvageValue, 0) / remainingMonths)
      depAmount = Math.max(dbAmount, slSwitch)
      if (i === usefulLifeMonths - 1) depAmount = round2(bookValue - salvageValue)
    }

    depAmount = Math.max(0, Math.min(depAmount, bookValue - salvageValue))
    accum = round2(accum + depAmount)
    bookValue = round2(bookValue - depAmount)

    lines.push({ assetId, period, periodDate, depreciationAmount: depAmount, accumulatedDepreciation: accum, bookValueAfter: bookValue })
    if (bookValue <= salvageValue) break
  }
  return lines
}

/** Generate next asset number: FA-YYYY-NNNN */
async function nextAssetNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `FA-${year}-`
  const r = await query(
    `SELECT asset_number FROM fixed_assets WHERE company_id=$1 AND asset_number LIKE $2 ORDER BY asset_number DESC LIMIT 1`,
    [companyId, `${prefix}%`],
  )
  const last = r.rows[0]?.['asset_number'] as string | undefined
  const seq = last ? parseInt(last.split('-')[2] ?? '0', 10) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

// ─── Categories ──────────────────────────────────────────────────────────────

assetsRouter.get('/categories', requirePermission('finance.assets.view', 'view'), async (req, res) => {
  try {
    const r = await query(`SELECT * FROM asset_categories WHERE company_id=$1 ORDER BY name`, [req.auth!.companyId])
    sendOk(res, r.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list categories', err) }
})

assetsRouter.post('/categories', requirePermission('finance.assets.edit', 'edit'), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    default_depreciation_method: z.enum(['straight_line', 'declining_balance']).default('straight_line'),
    default_useful_life_months: z.coerce.number().int().positive().optional(),
    default_declining_rate: z.coerce.number().optional(),
  })
  try {
    const d = schema.parse(req.body)
    const r = await query(
      `INSERT INTO asset_categories (company_id, name, default_depreciation_method, default_useful_life_months, default_declining_rate)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.auth!.companyId, d.name, d.default_depreciation_method, d.default_useful_life_months ?? null, d.default_declining_rate ?? null],
    )
    sendOk(res, r.rows[0], 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create category', err) }
})

// ─── Summary / KPIs ──────────────────────────────────────────────────────────

assetsRouter.get('/summary', requirePermission('finance.assets.view', 'view'), async (req, res) => {
  try {
    const r = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status='active')::int                    AS active_count,
         COUNT(*) FILTER (WHERE status='fully_depreciated')::int         AS fully_depreciated_count,
         COUNT(*) FILTER (WHERE status='disposed')::int                  AS disposed_count,
         COALESCE(SUM(purchase_cost) FILTER (WHERE status IN ('active','fully_depreciated')),0) AS total_cost,
         COALESCE(SUM(book_value) FILTER (WHERE status IN ('active','fully_depreciated')),0)    AS total_book_value,
         COALESCE(SUM(accumulated_depreciation) FILTER (WHERE status IN ('active','fully_depreciated')),0) AS total_accum_dep,
         COUNT(*) FILTER (
           WHERE status='active'
             AND EXISTS (
               SELECT 1 FROM asset_depreciation_schedule ads
               WHERE ads.asset_id=fixed_assets.id
                 AND ads.period=to_char(NOW(),'YYYY-MM')
                 AND ads.status='pending'
             )
         )::int AS pending_this_month
       FROM fixed_assets WHERE company_id=$1`,
      [req.auth!.companyId],
    )
    sendOk(res, r.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get summary', err) }
})

// ─── List ─────────────────────────────────────────────────────────────────────

assetsRouter.get('/', requirePermission('finance.assets.view', 'view'), async (req, res) => {
  try {
    const { status, category_id, search } = req.query
    const params: unknown[] = [req.auth!.companyId]
    let where = `fa.company_id=$1`
    if (status)      { params.push(status);      where += ` AND fa.status=$${params.length}` }
    if (category_id) { params.push(category_id); where += ` AND fa.category_id=$${params.length}` }
    if (search)      { params.push(`%${search}%`); where += ` AND (fa.name ILIKE $${params.length} OR fa.asset_number ILIKE $${params.length})` }

    const r = await query(
      `SELECT fa.*, ac.name AS category_name
       FROM fixed_assets fa
       LEFT JOIN asset_categories ac ON ac.id=fa.category_id
       WHERE ${where}
       ORDER BY fa.asset_number`,
      params,
    )
    sendOk(res, r.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list assets', err) }
})

// ─── Create ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  serial_number: z.string().optional(),
  location: z.string().optional(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchase_cost: z.coerce.number().positive(),
  salvage_value: z.coerce.number().min(0).default(0),
  useful_life_months: z.coerce.number().int().positive(),
  depreciation_method: z.enum(['straight_line', 'declining_balance']).default('straight_line'),
  declining_rate: z.coerce.number().optional(),
  asset_account_id: z.string().uuid().optional(),
  accum_dep_account_id: z.string().uuid().optional(),
  dep_expense_account_id: z.string().uuid().optional(),
  vendor_id: z.string().uuid().optional(),
  notes: z.string().optional(),
})

assetsRouter.post('/', requirePermission('finance.assets.edit', 'edit'), async (req, res) => {
  try {
    const d = createSchema.parse(req.body)
    const assetNumber = await nextAssetNumber(req.auth!.companyId)
    const r = await query(
      `INSERT INTO fixed_assets
         (company_id, asset_number, name, description, category_id, serial_number, location,
          purchase_date, purchase_cost, salvage_value, useful_life_months, depreciation_method,
          declining_rate, book_value, asset_account_id, accum_dep_account_id, dep_expense_account_id,
          vendor_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$9,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        req.auth!.companyId, assetNumber, d.name, d.description ?? null, d.category_id ?? null,
        d.serial_number ?? null, d.location ?? null, d.purchase_date, d.purchase_cost, d.salvage_value,
        d.useful_life_months, d.depreciation_method, d.declining_rate ?? null,
        d.asset_account_id ?? null, d.accum_dep_account_id ?? null, d.dep_expense_account_id ?? null,
        d.vendor_id ?? null, d.notes ?? null, req.auth!.userId,
      ],
    )
    await logAudit({ companyId: req.auth!.companyId, userId: req.auth!.userId, action: 'CREATE', tableName: 'fixed_assets', recordId: r.rows[0]!['id'] as string, newValues: d })
    sendOk(res, r.rows[0], 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create asset', err) }
})

// ─── Get by ID ────────────────────────────────────────────────────────────────

assetsRouter.get('/:id', requirePermission('finance.assets.view', 'view'), async (req, res) => {
  try {
    const [assetRes, scheduleRes] = await Promise.all([
      query(
        `SELECT fa.*, ac.name AS category_name,
                a1.name AS asset_account_name, a1.code AS asset_account_code,
                a2.name AS accum_dep_account_name, a2.code AS accum_dep_account_code,
                a3.name AS dep_expense_account_name, a3.code AS dep_expense_account_code
         FROM fixed_assets fa
         LEFT JOIN asset_categories ac ON ac.id=fa.category_id
         LEFT JOIN chart_of_accounts a1 ON a1.id=fa.asset_account_id
         LEFT JOIN chart_of_accounts a2 ON a2.id=fa.accum_dep_account_id
         LEFT JOIN chart_of_accounts a3 ON a3.id=fa.dep_expense_account_id
         WHERE fa.id=$1 AND fa.company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      ),
      query(
        `SELECT * FROM asset_depreciation_schedule WHERE asset_id=$1 ORDER BY period`,
        [req.params['id']],
      ),
    ])
    if (!assetRes.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Asset not found')
    sendOk(res, { ...assetRes.rows[0], schedule: scheduleRes.rows })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get asset', err) }
})

// ─── Update ───────────────────────────────────────────────────────────────────

assetsRouter.patch('/:id', requirePermission('finance.assets.edit', 'edit'), async (req, res) => {
  try {
    const asset = await query(`SELECT * FROM fixed_assets WHERE id=$1 AND company_id=$2`, [req.params['id'], req.auth!.companyId])
    if (!asset.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Asset not found')
    if (asset.rows[0]!['status'] !== 'draft') return sendError(res, 400, 'INVALID_STATE', 'Only draft assets can be edited. Dispose and recreate to change an active asset.')

    const schema = createSchema.partial()
    const d = schema.parse(req.body)
    const fields: string[] = []
    const params: unknown[] = []
    let idx = 1
    const map: Record<string, unknown> = {
      name: d.name, description: d.description, category_id: d.category_id,
      serial_number: d.serial_number, location: d.location, purchase_date: d.purchase_date,
      purchase_cost: d.purchase_cost, salvage_value: d.salvage_value,
      useful_life_months: d.useful_life_months, depreciation_method: d.depreciation_method,
      declining_rate: d.declining_rate, asset_account_id: d.asset_account_id,
      accum_dep_account_id: d.accum_dep_account_id, dep_expense_account_id: d.dep_expense_account_id,
      vendor_id: d.vendor_id, notes: d.notes,
    }
    for (const [k, v] of Object.entries(map)) {
      if (v !== undefined) { fields.push(`${k}=$${idx++}`); params.push(v) }
    }
    if (d.purchase_cost !== undefined) { fields.push(`book_value=$${idx++}`); params.push(d.purchase_cost) }
    if (!fields.length) return sendError(res, 400, 'NO_FIELDS', 'No fields to update')
    fields.push(`updated_at=NOW()`)
    params.push(req.params['id'], req.auth!.companyId)
    const r = await query(`UPDATE fixed_assets SET ${fields.join(',')} WHERE id=$${idx++} AND company_id=$${idx} RETURNING *`, params)
    await logAudit({ companyId: req.auth!.companyId, userId: req.auth!.userId, action: 'UPDATE', tableName: 'fixed_assets', recordId: req.params['id']!, newValues: d })
    sendOk(res, r.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update asset', err) }
})

// ─── Activate ─────────────────────────────────────────────────────────────────

assetsRouter.post('/:id/activate', requirePermission('finance.assets.edit', 'edit'), async (req, res) => {
  try {
    const existing = await query(`SELECT * FROM fixed_assets WHERE id=$1 AND company_id=$2`, [req.params['id'], req.auth!.companyId])
    const asset = existing.rows[0]
    if (!asset) return sendError(res, 404, 'NOT_FOUND', 'Asset not found')
    if (asset['status'] !== 'draft') return sendError(res, 400, 'INVALID_STATE', 'Asset is already active or disposed')

    const activationDate = new Date((req.body['activation_date'] as string | undefined) ?? (asset['purchase_date'] as string))
    const schedule = buildSchedule(
      asset['id'] as string,
      Number(asset['purchase_cost']),
      Number(asset['salvage_value']),
      Number(asset['useful_life_months']),
      asset['depreciation_method'] as 'straight_line' | 'declining_balance',
      asset['declining_rate'] ? Number(asset['declining_rate']) : null,
      activationDate,
    )

    const result = await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
      async (client) => {
        for (const line of schedule) {
          await client.query(
            `INSERT INTO asset_depreciation_schedule (asset_id, period, period_date, depreciation_amount, accumulated_depreciation, book_value_after)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (asset_id, period) DO NOTHING`,
            [line.assetId, line.period, line.periodDate, line.depreciationAmount, line.accumulatedDepreciation, line.bookValueAfter],
          )
        }
        const activated = await client.query(
          `UPDATE fixed_assets SET status='active', activation_date=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
          [activationDate.toISOString().split('T')[0], asset['id']],
        )
        return activated.rows[0]
      },
    )

    await logAudit({ companyId: req.auth!.companyId, userId: req.auth!.userId, action: 'UPDATE', tableName: 'fixed_assets', recordId: asset['id'] as string, newValues: { status: 'active', activation_date: activationDate, schedule_lines: schedule.length } })
    sendOk(res, { ...result, schedule })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to activate asset', err)
  }
})

// ─── Run Depreciation (single period) ────────────────────────────────────────

assetsRouter.post('/run-depreciation', requirePermission('finance.assets.edit', 'edit'), async (req, res) => {
  const period = (req.body['period'] as string | undefined) ?? (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  try {
    const pendingCheck = await query(
      `SELECT COUNT(*) AS cnt FROM asset_depreciation_schedule ads
       JOIN fixed_assets fa ON fa.id=ads.asset_id
       WHERE fa.company_id=$1 AND ads.period=$2 AND ads.status='pending' AND fa.status='active'`,
      [req.auth!.companyId, period],
    )
    if (Number(pendingCheck.rows[0]!['cnt']) === 0) {
      return sendOk(res, { posted: 0, period, message: 'No pending depreciation lines for this period' })
    }

    const posted = await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
      async (client) => {
        const lines = await client.query(
          `SELECT ads.*, fa.name AS asset_name, fa.asset_number, fa.purchase_cost, fa.salvage_value,
                  fa.dep_expense_account_id, fa.accum_dep_account_id, fa.accumulated_depreciation AS current_accum
           FROM asset_depreciation_schedule ads
           JOIN fixed_assets fa ON fa.id=ads.asset_id
           WHERE fa.company_id=$1 AND ads.period=$2 AND ads.status='pending' AND fa.status='active'
           FOR UPDATE OF ads`,
          [req.auth!.companyId, period],
        )
        const postedIds: string[] = []
        for (const line of lines.rows) {
          const depExpAccount  = line['dep_expense_account_id'] as string | null
          const accumDepAccount = line['accum_dep_account_id'] as string | null
          const depAmount = Number(line['depreciation_amount'])
          let journalEntryId: string | null = null

          if (depExpAccount && accumDepAccount) {
            const jeRes = await client.query(
              `INSERT INTO journal_entries (company_id, reference, description, entry_date, source_type, status, created_by)
               VALUES ($1,$2,$3,$4,'depreciation','posted',$5) RETURNING id`,
              [req.auth!.companyId, `DEP-${line['asset_number'] as string}-${period}`, `Depreciation: ${line['asset_name'] as string} — ${period}`, `${period}-01`, req.auth!.userId],
            )
            journalEntryId = jeRes.rows[0]!['id'] as string
            await client.query(`INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,0)`, [journalEntryId, depExpAccount, `Depreciation: ${line['asset_name'] as string}`, depAmount])
            await client.query(`INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,0,$4)`, [journalEntryId, accumDepAccount, `Accumulated Dep: ${line['asset_name'] as string}`, depAmount])
          }

          await client.query(`UPDATE asset_depreciation_schedule SET status='posted', journal_entry_id=$1, posted_at=NOW() WHERE id=$2`, [journalEntryId, line['id']])

          const newAccum   = round2(Number(line['current_accum']) + depAmount)
          const newBook    = round2(Number(line['purchase_cost']) - newAccum)
          const nextStatus = newBook <= Number(line['salvage_value']) ? 'fully_depreciated' : 'active'
          await client.query(`UPDATE fixed_assets SET accumulated_depreciation=$1, book_value=$2, status=$3, updated_at=NOW() WHERE id=$4`, [newAccum, Math.max(newBook, 0), nextStatus, line['asset_id']])
          postedIds.push(line['asset_id'] as string)
        }
        return postedIds
      },
    )

    sendOk(res, { posted: posted.length, period, asset_ids: posted })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to run depreciation', err)
  }
})

// ─── Dispose ──────────────────────────────────────────────────────────────────

assetsRouter.post('/:id/dispose', requirePermission('finance.assets.edit', 'edit'), async (req, res) => {
  const disposeSchema = z.object({
    disposal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    disposal_proceeds: z.coerce.number().min(0).default(0),
    disposal_notes: z.string().optional(),
    gain_loss_account_id: z.string().uuid().optional(),
    cash_account_id: z.string().uuid().optional(),
  })
  try {
    const d = disposeSchema.parse(req.body)

    const existing = await query(`SELECT * FROM fixed_assets WHERE id=$1 AND company_id=$2`, [req.params['id'], req.auth!.companyId])
    const asset = existing.rows[0]
    if (!asset) return sendError(res, 404, 'NOT_FOUND', 'Asset not found')
    if (!['active', 'fully_depreciated'].includes(asset['status'] as string)) {
      return sendError(res, 400, 'INVALID_STATE', 'Only active or fully depreciated assets can be disposed')
    }

    const bookValue    = Number(asset['book_value'])
    const proceeds     = d.disposal_proceeds
    const gainLoss     = round2(proceeds - bookValue)
    const accumDep     = Number(asset['accumulated_depreciation'])
    const purchaseCost = Number(asset['purchase_cost'])

    const updated = await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
      async (client) => {
        if (asset['asset_account_id'] && asset['accum_dep_account_id']) {
          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, reference, description, entry_date, source_type, status, created_by)
             VALUES ($1,$2,$3,$4,'asset_disposal','posted',$5) RETURNING id`,
            [req.auth!.companyId, `DISP-${asset['asset_number'] as string}`, `Disposal: ${asset['name'] as string}`, d.disposal_date, req.auth!.userId],
          )
          const jeId = jeRes.rows[0]!['id'] as string
          await client.query(`INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,0)`, [jeId, asset['accum_dep_account_id'], `Clear accum dep: ${asset['name'] as string}`, accumDep])
          await client.query(`INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,0,$4)`, [jeId, asset['asset_account_id'], `Dispose asset: ${asset['name'] as string}`, purchaseCost])
          if (proceeds > 0 && d.cash_account_id) {
            await client.query(`INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,0)`, [jeId, d.cash_account_id, `Disposal proceeds: ${asset['name'] as string}`, proceeds])
          }
          if (gainLoss !== 0 && d.gain_loss_account_id) {
            if (gainLoss > 0) {
              await client.query(`INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,0,$4)`, [jeId, d.gain_loss_account_id, `Gain on disposal: ${asset['name'] as string}`, gainLoss])
            } else {
              await client.query(`INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,0)`, [jeId, d.gain_loss_account_id, `Loss on disposal: ${asset['name'] as string}`, Math.abs(gainLoss)])
            }
          }
        }
        await client.query(`UPDATE asset_depreciation_schedule SET status='skipped' WHERE asset_id=$1 AND status='pending'`, [asset['id']])
        const r = await client.query(
          `UPDATE fixed_assets SET status='disposed', disposal_date=$1, disposal_proceeds=$2, disposal_gain_loss=$3, disposal_notes=$4, book_value=0, updated_at=NOW() WHERE id=$5 RETURNING *`,
          [d.disposal_date, proceeds, gainLoss, d.disposal_notes ?? null, asset['id']],
        )
        return r.rows[0]
      },
    )

    await logAudit({ companyId: req.auth!.companyId, userId: req.auth!.userId, action: 'UPDATE', tableName: 'fixed_assets', recordId: asset['id'] as string, newValues: { status: 'disposed', disposal_date: d.disposal_date, gain_loss: gainLoss } })
    sendOk(res, updated)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to dispose asset', err)
  }
})
