// Coverage for this session's two-part fix: (1) any company can now see and
// source Nishtimani Factory's stock during Inventory Check regardless of the
// caller's own user_company_roles grants (migration 280's is_central_warehouse
// flag), and (2) confirming a cross-company Store Out (issueMaterialIssue)
// now auto-creates a linked, 'pending' interco_transactions bill instead of
// silently moving value between companies with nothing to charge it through.
// Real-Postgres pattern, same as cancel-material-issue-reservation.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const FACTORY_COMPANY_ID = '00000000-0000-0000-0000-000000000002'
const YAKAM_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'interco-billing-bridge-test@fnc-erp.local'
const SKU_PREFIX = 'INTERCOBRIDGETEST-'
const TEST_COMPANY_NAME_PREFIX = 'INTERCOBRIDGETEST-Company-'

let userId: string
let factoryWarehouseId: string
let factoryVirtualInId: string
let yakamWarehouseId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeFactoryProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [FACTORY_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function receiveAtFactory(productId: string, qty: number, unitCost = 20): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
    [FACTORY_COMPANY_ID, productId, factoryVirtualInId, factoryWarehouseId, qty, unitCost, qty * unitCost, userId],
  )
}

// Creates a throwaway company on a currency other than IQD (every real
// company in this deployment is IQD today) plus its own warehouse/virtual_in
// location, so a cross-company Store Out sourced from it exercises the real
// per-company currency lookup and fx_rates conversion instead of coasting on
// every test company happening to share a currency.
async function makeForeignCurrencyCompany(
  currencyCode: string,
): Promise<{ companyId: string; warehouseId: string; virtualInId: string }> {
  const name = `${TEST_COMPANY_NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, currency_code) VALUES ($1,$1,$2) RETURNING id`,
    [name, currencyCode],
  )
  const companyId = companyRes.rows[0]!.id
  const warehouseRes = await pool.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,'Test Warehouse','warehouse',true) RETURNING id`,
    [companyId],
  )
  const virtualInRes = await pool.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,'Virtual Receipts','virtual_in',true) RETURNING id`,
    [companyId],
  )
  return { companyId, warehouseId: warehouseRes.rows[0]!.id, virtualInId: virtualInRes.rows[0]!.id }
}

async function makeProductForCompany(companyId: string, suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [companyId, sku, sku],
  )
  return r.rows[0]!.id
}

async function receiveAt(
  companyId: string,
  productId: string,
  fromLocationId: string,
  toLocationId: string,
  qty: number,
  unitCost: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
    [companyId, productId, fromLocationId, toLocationId, qty, unitCost, qty * unitCost, userId],
  )
}

async function getOnHand(productId: string, locationId: string): Promise<number> {
  const r = await pool.query<{ qty_on_hand: string }>(
    `SELECT qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return parseFloat(r.rows[0]?.qty_on_hand ?? '0')
}

async function cleanup(): Promise<void> {
  // userId isn't assigned yet on the very first beforeAll call — every
  // interco_transactions/transfer row this suite creates is attributable to
  // it either way, so this is the one filter guaranteed to catch them all
  // (description/notes text is free-form and not safe to match on).
  if (userId) {
    // interco_stock_transfers.interco_transaction_id FKs into
    // interco_transactions, so the transfer (and its lines) must go first.
    await pool.query(
      `DELETE FROM interco_stock_transfer_lines WHERE transfer_id IN (SELECT id FROM interco_stock_transfers WHERE initiated_by=$1)`,
      [userId],
    )
    await pool.query(`DELETE FROM interco_stock_transfers WHERE initiated_by=$1`, [userId])
    // interco_transactions.from/to_journal_entry_id reference journal_entries,
    // so it has to go before those — journal_lines before journal_entries
    // (its own child), matched by reference since interco_transactions is
    // about to be gone and can no longer be joined back to them by source_id.
    await pool.query(
      `DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE reference LIKE 'IT-TEST-%')`,
    )
    await pool.query(`DELETE FROM interco_transactions WHERE created_by=$1`, [userId])
    await pool.query(`DELETE FROM journal_entries WHERE reference LIKE 'IT-TEST-%'`)
  }
  if (userId) {
    await pool.query(
      `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE created_by=$1)`,
      [userId],
    )
    await pool.query(`DELETE FROM project_material_issues WHERE created_by=$1`, [userId])
  }
  // Not scoped by company_id: the same-company test below reassigns its
  // product's company_id to Yakam and only reverts it on success, so a
  // failed assertion in between would otherwise leave that row permanently
  // unreachable to a company_id=FACTORY-scoped cleanup. The SKU prefix alone
  // is already unique to this suite.
  await pool.query(
    `DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    [`${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    [`${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [`${SKU_PREFIX}%`])
  // Throwaway foreign-currency companies from makeForeignCurrencyCompany —
  // their stock_locations must go before the company row itself.
  await pool.query(
    `DELETE FROM stock_locations WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1)`,
    [`${TEST_COMPANY_NAME_PREFIX}%`],
  )
  await pool.query(`DELETE FROM companies WHERE name LIKE $1`, [`${TEST_COMPANY_NAME_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  // Confirming as Yakam (the company drawing stock), system_admin bypasses
  // both the projects.execution.edit permission and the store_keeper gate.
  ctx = {
    auth: { companyId: YAKAM_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'interco-bridge-test' },
  }

  const fwh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [FACTORY_COMPANY_ID],
  )
  if (!fwh.rows[0]) throw new Error('No Factory warehouse location seeded — run seeds first')
  factoryWarehouseId = fwh.rows[0].id

  const fvi = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [FACTORY_COMPANY_ID],
  )
  if (!fvi.rows[0]) throw new Error('No Factory virtual_in location seeded — run seeds first')
  factoryVirtualInId = fvi.rows[0].id

  const ywh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [YAKAM_COMPANY_ID],
  )
  if (!ywh.rows[0]) throw new Error('No Yakam warehouse location seeded — run seeds first')
  yakamWarehouseId = ywh.rows[0].id

  // Belt-and-braces alongside seed-companies.ts setting this directly:
  // migrations always run before seeds, so migration 280's own data-fixing
  // UPDATE (which assumes this company row already exists, true on every
  // real deployment) silently matches nothing on a freshly-migrated-then-
  // seeded DB. Set it explicitly here too so this suite's own precondition
  // never depends on that ordering — a no-op on a real dev/prod DB where
  // it's already true.
  await pool.query(`UPDATE companies SET is_central_warehouse=true WHERE id=$1`, [FACTORY_COMPANY_ID])

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('requisitionStockAvailability / poStockAvailability central-warehouse visibility', () => {
  it('is_central_warehouse is set for Nishtimani Factory only', async () => {
    const r = await pool.query<{ id: string; is_central_warehouse: boolean }>(
      `SELECT id, is_central_warehouse FROM companies WHERE id IN ($1,$2)`,
      [FACTORY_COMPANY_ID, YAKAM_COMPANY_ID],
    )
    const byId = Object.fromEntries(r.rows.map((row) => [row.id, row.is_central_warehouse]))
    expect(byId[FACTORY_COMPANY_ID]).toBe(true)
    expect(byId[YAKAM_COMPANY_ID]).toBe(false)
  })
})

describe('issueMaterialIssue cross-company Store Out auto-creates the interco billing link', () => {
  it('moves stock, creates one interco_stock_transfers header + line, and links one pending interco_transactions row', async () => {
    const productId = await makeFactoryProduct('cross-company-issue')
    await receiveAtFactory(productId, 15, 20)
    expect(await getOnHand(productId, factoryWarehouseId)).toBe(15)

    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string; issueNumber: string }

    // Cross-company: the confirming company is Yakam, but this line's source
    // is a Factory location — exactly the case migration 280 makes routinely
    // reachable now that Factory stock shows up in the Inventory Check picker
    // for any company.
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      {
        issueId: issue.id,
        productId,
        qtyIssued: 10,
        unitCost: 20,
        fromLocationId: factoryWarehouseId,
      },
      ctx as never,
    )

    const confirmed = (await resolvers.Mutation.issueMaterialIssue(
      null,
      { id: issue.id },
      ctx as never,
    )) as { status: string }
    expect(confirmed.status).toBe('issued')

    // Stock actually left the Factory warehouse.
    expect(await getOnHand(productId, factoryWarehouseId)).toBe(5)

    const transfers = await pool.query<{
      id: string
      from_company_id: string
      to_company_id: string
      source_type: string
      status: string
      interco_transaction_id: string | null
    }>(
      `SELECT ist.id, ist.from_company_id, ist.to_company_id, ist.source_type, ist.status, ist.interco_transaction_id
       FROM interco_stock_transfers ist
       JOIN interco_stock_transfer_lines istl ON istl.transfer_id = ist.id
       WHERE istl.product_id = $1`,
      [productId],
    )
    expect(transfers.rows).toHaveLength(1)
    const transfer = transfers.rows[0]!
    expect(transfer.from_company_id).toBe(FACTORY_COMPANY_ID)
    expect(transfer.to_company_id).toBe(YAKAM_COMPANY_ID)
    // Auto-created from a Store Out, not the manual creation mutation.
    expect(transfer.source_type).toBe('project_issue')
    expect(transfer.status).toBe('posted')
    expect(transfer.interco_transaction_id).not.toBeNull()

    const lines = await pool.query<{
      qty: string
      avco_at_transfer: string
      total_transfer_value: string
      currency_code: string
    }>(
      `SELECT qty, avco_at_transfer, total_transfer_value, currency_code FROM interco_stock_transfer_lines WHERE transfer_id=$1`,
      [transfer.id],
    )
    expect(lines.rows).toHaveLength(1)
    expect(parseFloat(lines.rows[0]!.qty)).toBe(10)
    expect(parseFloat(lines.rows[0]!.avco_at_transfer)).toBeCloseTo(20, 5)
    expect(parseFloat(lines.rows[0]!.total_transfer_value)).toBeCloseTo(200, 5)
    // Factory's own currency — every company in this deployment is IQD, but
    // this reads it off companies.currency_code rather than assuming it.
    expect(lines.rows[0]!.currency_code).toBe('IQD')

    const tx = await pool.query<{
      transaction_type: string
      status: string
      amount: string
      currency_code: string
      fx_rate: string
      from_company_id: string
      to_company_id: string
    }>(
      `SELECT transaction_type, status, amount, currency_code, fx_rate, from_company_id, to_company_id FROM interco_transactions WHERE id=$1`,
      [transfer.interco_transaction_id],
    )
    expect(tx.rows).toHaveLength(1)
    expect(tx.rows[0]!.transaction_type).toBe('goods_transfer')
    // Never auto-posted — stays pending for Finance's existing
    // approval/posting-account flow (postIntercoTransaction) to handle.
    expect(tx.rows[0]!.status).toBe('pending')
    expect(parseFloat(tx.rows[0]!.amount)).toBeCloseTo(200, 5)
    expect(tx.rows[0]!.currency_code).toBe('IQD')
    // Same currency both sides — no real conversion needed.
    expect(parseFloat(tx.rows[0]!.fx_rate)).toBe(1)
    expect(tx.rows[0]!.from_company_id).toBe(FACTORY_COMPANY_ID)
    expect(tx.rows[0]!.to_company_id).toBe(YAKAM_COMPANY_ID)

    // The list/detail resolvers surface the link (the frontend Billing column/section).
    const detail = (await resolvers.Query.intercoStockTransfer(null, { id: transfer.id }, ctx as never)) as {
      intercoTransactionId: string | null
      intercoTransactionStatus: string | null
      currencyCode: string
      lines: { currencyCode: string }[]
    }
    expect(detail.intercoTransactionId).toBe(transfer.interco_transaction_id)
    expect(detail.intercoTransactionStatus).toBe('pending')
    expect(detail.currencyCode).toBe('IQD')
    expect(detail.lines[0]!.currencyCode).toBe('IQD')
  })

  it('aggregates multiple lines from the same source company into a single transfer + single bill', async () => {
    const productA = await makeFactoryProduct('aggregate-a')
    const productB = await makeFactoryProduct('aggregate-b')
    await receiveAtFactory(productA, 8, 10)
    await receiveAtFactory(productB, 8, 30)

    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId: productA, qtyIssued: 4, unitCost: 10, fromLocationId: factoryWarehouseId },
      ctx as never,
    )
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId: productB, qtyIssued: 2, unitCost: 30, fromLocationId: factoryWarehouseId },
      ctx as never,
    )
    await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never)

    const transfers = await pool.query<{ id: string; interco_transaction_id: string }>(
      `SELECT DISTINCT ist.id, ist.interco_transaction_id
       FROM interco_stock_transfers ist
       JOIN interco_stock_transfer_lines istl ON istl.transfer_id = ist.id
       WHERE istl.product_id IN ($1,$2)`,
      [productA, productB],
    )
    // Both lines share the same source company (Factory) and the same
    // confirming issue, so they must collapse into one header/one bill —
    // not one pair per line — so Finance isn't flooded with duplicates.
    expect(transfers.rows).toHaveLength(1)
    const transferId = transfers.rows[0]!.id

    const lines = await pool.query(`SELECT product_id FROM interco_stock_transfer_lines WHERE transfer_id=$1`, [
      transferId,
    ])
    expect(lines.rows).toHaveLength(2)

    const tx = await pool.query<{ amount: string }>(`SELECT amount FROM interco_transactions WHERE id=$1`, [
      transfers.rows[0]!.interco_transaction_id,
    ])
    // 4*10 + 2*30 = 100
    expect(parseFloat(tx.rows[0]!.amount)).toBeCloseTo(100, 5)
  })

  it('does not touch interco_stock_transfers or interco_transactions for a same-company Store Out', async () => {
    const productId = await makeFactoryProduct('same-company')
    await pool.query(
      `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
      [YAKAM_COMPANY_ID, productId, factoryVirtualInId, yakamWarehouseId, 6, 5, 30, userId],
    )
    // Move the product's own company to Yakam too, matching a same-company
    // scenario cleanly (product creation company is incidental to this path).
    await pool.query(`UPDATE products SET company_id=$1 WHERE id=$2`, [YAKAM_COMPANY_ID, productId])

    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 3, unitCost: 5, fromLocationId: yakamWarehouseId },
      ctx as never,
    )
    await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never)

    const transfers = await pool.query(
      `SELECT ist.id FROM interco_stock_transfers ist
       JOIN interco_stock_transfer_lines istl ON istl.transfer_id = ist.id
       WHERE istl.product_id = $1`,
      [productId],
    )
    expect(transfers.rows).toHaveLength(0)

    await pool.query(`UPDATE products SET company_id=$1 WHERE id=$2`, [FACTORY_COMPANY_ID, productId])
  })
})

describe('issueMaterialIssue cross-company Store Out records the real currency, not a hardcoded one', () => {
  it('prices the transfer/bill in the source company\'s own currency and looks up a real fx_rate when it differs from the destination', async () => {
    const foreign = await makeForeignCurrencyCompany('USD')
    const productId = await makeProductForCompany(foreign.companyId, 'foreign-currency')
    await receiveAt(foreign.companyId, productId, foreign.virtualInId, foreign.warehouseId, 10, 50)
    expect(await getOnHand(productId, foreign.warehouseId)).toBe(10)

    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    // Confirming as Yakam (IQD) again, but this time sourced from a USD
    // company — the case that was silently mislabeled/hardcoded before.
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 4, unitCost: 50, fromLocationId: foreign.warehouseId },
      ctx as never,
    )
    await resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never)

    const transfers = await pool.query<{ id: string; interco_transaction_id: string }>(
      `SELECT ist.id, ist.interco_transaction_id
       FROM interco_stock_transfers ist
       JOIN interco_stock_transfer_lines istl ON istl.transfer_id = ist.id
       WHERE istl.product_id = $1`,
      [productId],
    )
    expect(transfers.rows).toHaveLength(1)
    const transfer = transfers.rows[0]!

    const lines = await pool.query<{ currency_code: string; total_transfer_value: string }>(
      `SELECT currency_code, total_transfer_value FROM interco_stock_transfer_lines WHERE transfer_id=$1`,
      [transfer.id],
    )
    expect(lines.rows[0]!.currency_code).toBe('USD')
    expect(parseFloat(lines.rows[0]!.total_transfer_value)).toBeCloseTo(200, 5)

    const tx = await pool.query<{ currency_code: string; fx_rate: string; amount: string }>(
      `SELECT currency_code, fx_rate, amount FROM interco_transactions WHERE id=$1`,
      [transfer.interco_transaction_id],
    )
    expect(tx.rows[0]!.currency_code).toBe('USD')
    expect(parseFloat(tx.rows[0]!.amount)).toBeCloseTo(200, 5)
    // A real USD→IQD rate from the auto-synced fx_rates table — not the 1
    // that createIntercoTransaction's own default (and the old hardcoded
    // 'IQD' literal here) would have implied for a same-currency pair.
    const fxRate = parseFloat(tx.rows[0]!.fx_rate)
    expect(fxRate).toBeGreaterThan(1)

    const dbRate = await pool.query<{ rate: string }>(
      `SELECT rate FROM fx_rates WHERE from_currency='USD' AND to_currency='IQD' ORDER BY rate_date DESC LIMIT 1`,
    )
    expect(fxRate).toBeCloseTo(parseFloat(dbRate.rows[0]!.rate), 5)

    const detail = (await resolvers.Query.intercoStockTransfer(null, { id: transfer.id }, ctx as never)) as {
      currencyCode: string
      lines: { currencyCode: string }[]
    }
    expect(detail.currencyCode).toBe('USD')
    expect(detail.lines[0]!.currencyCode).toBe('USD')

    const list = (await resolvers.Query.intercoStockTransfers(
      null,
      { page: 1, limit: 50 },
      ctx as never,
    )) as { items: { id: string; currencyCode: string }[] }
    const listItem = list.items.find((it) => it.id === transfer.id)
    expect(listItem?.currencyCode).toBe('USD')
  })

  it('falls back to fx_rate=1 for a currency pair with no synced rate, without blocking the confirmation', async () => {
    const foreign = await makeForeignCurrencyCompany('ZZZ')
    const productId = await makeProductForCompany(foreign.companyId, 'no-fx-rate')
    await receiveAt(foreign.companyId, productId, foreign.virtualInId, foreign.warehouseId, 5, 10)

    const issue = (await resolvers.Mutation.createMaterialIssue(
      null,
      { issueDate: new Date().toISOString().slice(0, 10) },
      ctx as never,
    )) as { id: string }
    await resolvers.Mutation.addMaterialIssueLine(
      null,
      { issueId: issue.id, productId, qtyIssued: 2, unitCost: 10, fromLocationId: foreign.warehouseId },
      ctx as never,
    )
    await expect(
      resolvers.Mutation.issueMaterialIssue(null, { id: issue.id }, ctx as never),
    ).resolves.toMatchObject({ status: 'issued' })

    const tx = await pool.query<{ currency_code: string; fx_rate: string }>(
      `SELECT it.currency_code, it.fx_rate FROM interco_transactions it
       JOIN interco_stock_transfers ist ON ist.interco_transaction_id = it.id
       JOIN interco_stock_transfer_lines istl ON istl.transfer_id = ist.id
       WHERE istl.product_id = $1`,
      [productId],
    )
    expect(tx.rows[0]!.currency_code).toBe('ZZZ')
    expect(parseFloat(tx.rows[0]!.fx_rate)).toBe(1)
  })
})

describe('postIntercoTransaction resolves each company\'s own FX conversion independently', () => {
  it('never applies the to-company\'s conversion rate to the from-company\'s own books', async () => {
    // From = a throwaway USD company (currency_code matches the
    // transaction's own currency, same as every auto-created interco
    // transaction) — its own journal should need NO conversion at all.
    // To = Yakam (IQD) — this side genuinely needs the USD->IQD rate.
    // chart_of_accounts.company_id cascades on company delete, so these
    // throwaway accounts need no cleanup of their own beyond the company's.
    const foreign = await makeForeignCurrencyCompany('USD')
    const receivableRes = await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_active)
       VALUES ($1, '9701', 'Intercompany Receivable', 'asset', true) RETURNING id`,
      [foreign.companyId],
    )
    const revenueRes = await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_active)
       VALUES ($1, '9702', 'Test Revenue', 'revenue', true) RETURNING id`,
      [foreign.companyId],
    )
    const yakamExpenseRes = await pool.query<{ id: string }>(
      `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND account_type='expense' AND is_active=true AND is_postable=true ORDER BY code ASC LIMIT 1`,
      [YAKAM_COMPANY_ID],
    )
    expect(yakamExpenseRes.rows[0]).toBeTruthy()

    const txRes = await pool.query<{ id: string }>(
      `INSERT INTO interco_transactions
         (from_company_id, to_company_id, transaction_type, amount, currency_code, fx_rate,
          from_account_id, to_account_id, from_company_approved_by, from_company_approved_at,
          to_company_approved_by, to_company_approved_at, reference, status, created_by)
       VALUES ($1,$2,'service_charge',100,'USD',1,$3,$4,$5,NOW(),$5,NOW(),$6,'pending',$5)
       RETURNING id`,
      [
        foreign.companyId,
        YAKAM_COMPANY_ID,
        revenueRes.rows[0]!.id,
        yakamExpenseRes.rows[0]!.id,
        userId,
        `IT-TEST-${Date.now()}`,
      ],
    )
    const txId = txRes.rows[0]!.id

    await resolvers.Mutation.postIntercoTransaction(null, { id: txId }, ctx as never)

    const dbRate = await pool.query<{ rate: string }>(
      `SELECT rate FROM fx_rates WHERE from_currency='USD' AND to_currency='IQD' ORDER BY rate_date DESC LIMIT 1`,
    )
    const usdToIqd = parseFloat(dbRate.rows[0]!.rate)
    expect(usdToIqd).toBeGreaterThan(1)

    const fromLines = await pool.query<{ fx_rate: string; amount_company_currency: string; debit: string; credit: string }>(
      `SELECT jl.fx_rate, jl.amount_company_currency, jl.debit, jl.credit
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.company_id=$1 AND je.source_type='interco_transaction' AND je.source_id=$2`,
      [foreign.companyId, txId],
    )
    expect(fromLines.rows).toHaveLength(2)
    for (const line of fromLines.rows) {
      // currency_code (USD) already IS this company's own currency, so its
      // own books need no conversion — not the to-company's USD->IQD rate.
      expect(parseFloat(line.fx_rate)).toBe(1)
      expect(parseFloat(line.amount_company_currency)).toBeCloseTo(100, 5)
      expect(parseFloat(line.debit) + parseFloat(line.credit)).toBeCloseTo(100, 5)
    }

    const toLines = await pool.query<{ fx_rate: string; amount_company_currency: string }>(
      `SELECT jl.fx_rate, jl.amount_company_currency
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.company_id=$1 AND je.source_type='interco_transaction' AND je.source_id=$2`,
      [YAKAM_COMPANY_ID, txId],
    )
    expect(toLines.rows).toHaveLength(2)
    for (const line of toLines.rows) {
      expect(parseFloat(line.fx_rate)).toBeCloseTo(usdToIqd, 5)
      expect(parseFloat(line.amount_company_currency)).toBeCloseTo(100 * usdToIqd, 2)
    }
  })
})
