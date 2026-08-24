import { pool } from './client.js'

export interface PoFxRate {
  company_id: string
  currency_code: string
  rate_to_base: number
  is_default: boolean
  updated_at: string | null
}

export async function listPoFxRates(companyId: string): Promise<PoFxRate[]> {
  const result = await pool.query<PoFxRate>(
    `SELECT company_id, currency_code, rate_to_base, is_default, updated_at
     FROM po_fx_rates WHERE company_id = $1 ORDER BY currency_code`,
    [companyId],
  )
  return result.rows
}

export async function upsertPoFxRate(
  companyId: string,
  currencyCode: string,
  rateToBase: number,
  updatedBy: string,
): Promise<PoFxRate> {
  const result = await pool.query<PoFxRate>(
    `INSERT INTO po_fx_rates (company_id, currency_code, rate_to_base, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET
       rate_to_base = EXCLUDED.rate_to_base,
       updated_by   = EXCLUDED.updated_by,
       updated_at   = NOW()
     RETURNING company_id, currency_code, rate_to_base, is_default, updated_at`,
    [companyId, currencyCode.toUpperCase(), rateToBase, updatedBy],
  )
  return result.rows[0]!
}

export async function deletePoFxRate(companyId: string, currencyCode: string): Promise<void> {
  await pool.query(`DELETE FROM po_fx_rates WHERE company_id = $1 AND currency_code = $2`, [
    companyId,
    currencyCode.toUpperCase(),
  ])
}

// Unsets any other default for the company first — the partial unique index
// (po_fx_rates_one_default_per_company) enforces at most one, but doing the
// unset explicitly avoids relying on constraint-violation-as-control-flow.
export async function setDefaultPoFxRate(companyId: string, currencyCode: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE po_fx_rates SET is_default = false WHERE company_id = $1 AND is_default = true`,
      [companyId],
    )
    const result = await client.query(
      `UPDATE po_fx_rates SET is_default = true WHERE company_id = $1 AND currency_code = $2`,
      [companyId, currencyCode.toUpperCase()],
    )
    if (result.rowCount === 0) throw new Error('Currency not found — add a rate for it first')
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
