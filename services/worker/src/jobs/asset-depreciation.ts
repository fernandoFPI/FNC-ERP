import { query, withSystemTransaction } from '@fnc-erp/db'
import { createServiceLogger } from '@fnc-erp/logger'

const log = createServiceLogger('asset-depreciation')

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Runs on the 1st of each month — posts prior month's depreciation for all companies */
export async function runMonthlyDepreciation(): Promise<void> {
  const now = new Date()
  now.setMonth(now.getMonth() - 1)
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  log.info({ period }, 'Starting monthly depreciation run')

  // Get all companies with pending depreciation for this period
  const companies = await query(
    `SELECT DISTINCT fa.company_id
     FROM asset_depreciation_schedule ads
     JOIN fixed_assets fa ON fa.id = ads.asset_id
     WHERE ads.period = $1 AND ads.status = 'pending' AND fa.status = 'active'`,
    [period],
  )

  if (!companies.rows.length) {
    log.info({ period }, 'No pending depreciation lines found')
    return
  }

  let totalPosted = 0

  for (const row of companies.rows) {
    const companyId = row['company_id'] as string
    try {
      await withSystemTransaction(async (client) => {
        const lines = await client.query(
        `SELECT ads.*, fa.name AS asset_name, fa.asset_number, fa.purchase_cost,
                fa.salvage_value, fa.accumulated_depreciation AS current_accum,
                fa.dep_expense_account_id, fa.accum_dep_account_id
         FROM asset_depreciation_schedule ads
         JOIN fixed_assets fa ON fa.id = ads.asset_id
         WHERE fa.company_id = $1 AND ads.period = $2
           AND ads.status = 'pending' AND fa.status = 'active'
         FOR UPDATE OF ads`,
        [companyId, period],
      )

      for (const line of lines.rows) {
        const depAmount    = Number(line['depreciation_amount'])
        const depExpAcct   = line['dep_expense_account_id'] as string | null
        const accumDepAcct = line['accum_dep_account_id'] as string | null

        let journalEntryId: string | null = null

        if (depExpAcct && accumDepAcct) {
          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, reference, description, entry_date, source_type, status)
             VALUES ($1,$2,$3,$4,'depreciation','posted') RETURNING id`,
            [
              companyId,
              `DEP-${line['asset_number'] as string}-${period}`,
              `Auto-depreciation: ${line['asset_name'] as string} — ${period}`,
              `${period}-01`,
            ],
          )
          journalEntryId = jeRes.rows[0]!['id'] as string

          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,0)`,
            [journalEntryId, depExpAcct, `Depreciation: ${line['asset_name'] as string}`, depAmount],
          )
          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,0,$4)`,
            [journalEntryId, accumDepAcct, `Accumulated Dep: ${line['asset_name'] as string}`, depAmount],
          )
        }

        await client.query(
          `UPDATE asset_depreciation_schedule SET status='posted', journal_entry_id=$1, posted_at=NOW() WHERE id=$2`,
          [journalEntryId, line['id']],
        )

        const newAccum  = round2(Number(line['current_accum']) + depAmount)
        const newBook   = round2(Number(line['purchase_cost']) - newAccum)
        const newStatus = newBook <= Number(line['salvage_value']) ? 'fully_depreciated' : 'active'

        await client.query(
          `UPDATE fixed_assets SET accumulated_depreciation=$1, book_value=$2, status=$3, updated_at=NOW() WHERE id=$4`,
          [newAccum, Math.max(newBook, 0), newStatus, line['asset_id']],
        )

        totalPosted++
      }
        log.info({ companyId, period, count: lines.rows.length }, 'Depreciation posted for company')
      })
    } catch (err) {
      log.error({ err, companyId, period }, 'Failed to post depreciation for company')
    }
  }

  log.info({ period, totalPosted }, 'Monthly depreciation run complete')
}
