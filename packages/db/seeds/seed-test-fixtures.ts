// Gives 8 services (auth, finance, hr, inventory, notifications, projects,
// rental, reporting) each their own dedicated company, instead of sharing
// one hardcoded '00000000-0000-0000-0000-000000000001' the way every
// service's tests/setup.ts used to. That sharing was the root of the
// "shared-fixture race": under full parallel `pnpm test` (13 services'
// test processes running at once via turbo), two unrelated services'
// tests could both be inserting/deleting rows for the exact same company
// at the exact same time. Within one service, fileParallelism:false
// already stops its own test *files* from interleaving — this is the
// other half, stopping different *services* from colliding with each
// other. gateway keeps company 001 (Nishtimani Yakam) — it's already
// isolated by being the only consumer left on that id, and rewriting its
// ~10 requisition/PO test files (each hardcoding the literal UUID
// throughout, not routed through a shared setup.ts constant) for no
// behavioral gain wasn't worth it.
//
// Deliberately NOT part of run-seeds.ts's pipeline — these are synthetic,
// test-only companies with no business meaning, and must never be
// inserted into a dev or production database. Refuses to run unless
// NODE_ENV=test, as a second guard beyond "only ever invoke this against
// DATABASE_TEST_URL."
//
// IDs use an 'f0000000-' prefix specifically to stay clear of every
// numbering range run-seeds.ts's other seed files already use for real
// data (00000000- companies, 10000000- work_locations, 20000000-
// departments, 30000000- shift_configs/projects, 40000000- leave_types)
// — unmistakably synthetic, never colliding with a real company added
// later.
import { Pool } from 'pg'

if (process.env['NODE_ENV'] !== 'test') {
  console.error('[seed-test-fixtures] Refusing to run outside NODE_ENV=test — these are synthetic test-only companies.')
  process.exit(1)
}

const connectionString = process.env['DATABASE_TEST_URL'] ?? process.env['DATABASE_URL']
if (!connectionString) {
  console.error('[seed-test-fixtures] DATABASE_TEST_URL is not set')
  process.exit(1)
}

const pool = new Pool({ connectionString })

const SERVICE_COMPANIES = [
  { key: 'AUTH', id: 'f0000000-0000-0000-0000-000000000001', workLocationId: 'f0000001-0000-0000-0000-000000000001', name: 'TEST-FIXTURE-AUTH' },
  { key: 'FINANCE', id: 'f0000000-0000-0000-0000-000000000002', workLocationId: 'f0000001-0000-0000-0000-000000000002', name: 'TEST-FIXTURE-FINANCE' },
  { key: 'HR', id: 'f0000000-0000-0000-0000-000000000003', workLocationId: 'f0000001-0000-0000-0000-000000000003', name: 'TEST-FIXTURE-HR' },
  { key: 'INVENTORY', id: 'f0000000-0000-0000-0000-000000000004', workLocationId: 'f0000001-0000-0000-0000-000000000004', name: 'TEST-FIXTURE-INVENTORY' },
  { key: 'NOTIFICATIONS', id: 'f0000000-0000-0000-0000-000000000005', workLocationId: 'f0000001-0000-0000-0000-000000000005', name: 'TEST-FIXTURE-NOTIFICATIONS' },
  { key: 'PROJECTS', id: 'f0000000-0000-0000-0000-000000000006', workLocationId: 'f0000001-0000-0000-0000-000000000006', name: 'TEST-FIXTURE-PROJECTS' },
  { key: 'RENTAL', id: 'f0000000-0000-0000-0000-000000000007', workLocationId: 'f0000001-0000-0000-0000-000000000007', name: 'TEST-FIXTURE-RENTAL' },
  { key: 'REPORTING', id: 'f0000000-0000-0000-0000-000000000008', workLocationId: 'f0000001-0000-0000-0000-000000000008', name: 'TEST-FIXTURE-REPORTING' },
] as const

// Exported so each service's tests/setup.ts can import its own id directly
// rather than re-typing the literal UUID.
export const TEST_FIXTURE_COMPANY_IDS: Record<(typeof SERVICE_COMPANIES)[number]['key'], string> =
  Object.fromEntries(SERVICE_COMPANIES.map((c) => [c.key, c.id])) as never
export const TEST_FIXTURE_WORK_LOCATION_IDS: Record<(typeof SERVICE_COMPANIES)[number]['key'], string> =
  Object.fromEntries(SERVICE_COMPANIES.map((c) => [c.key, c.workLocationId])) as never

// Same standard chart of accounts every real company gets (seed 002) —
// finance's tests look accounts up by code (getAccountId), so this needs
// to be the same set, not a trimmed one.
const CHART_OF_ACCOUNTS: { code: string; name: string; account_type: string; is_reconcilable?: boolean }[] = [
  { code: '1100', name: 'Cash and Bank Accounts', account_type: 'asset', is_reconcilable: true },
  { code: '1200', name: 'Accounts Receivable', account_type: 'asset', is_reconcilable: true },
  { code: '1300', name: 'Inventory / Raw Materials', account_type: 'asset' },
  { code: '1400', name: 'Work in Progress', account_type: 'asset' },
  { code: '1500', name: 'Prepaid Expenses', account_type: 'asset' },
  { code: '1600', name: 'Fixed Assets', account_type: 'asset' },
  { code: '1700', name: 'Intercompany Receivable', account_type: 'asset', is_reconcilable: true },
  { code: '2100', name: 'Accounts Payable', account_type: 'liability', is_reconcilable: true },
  { code: '2200', name: 'Accrued Liabilities', account_type: 'liability' },
  { code: '2300', name: 'Tax Payable', account_type: 'liability' },
  { code: '2400', name: 'Intercompany Payable', account_type: 'liability', is_reconcilable: true },
  { code: '3100', name: 'Share Capital', account_type: 'equity' },
  { code: '3200', name: 'Retained Earnings', account_type: 'equity' },
  { code: '4100', name: 'Construction Revenue', account_type: 'revenue' },
  { code: '4200', name: 'Manufacturing Revenue', account_type: 'revenue' },
  { code: '4300', name: 'Rental Revenue', account_type: 'revenue' },
  { code: '4400', name: 'Trading Revenue', account_type: 'revenue' },
  { code: '5100', name: 'Cost of Materials', account_type: 'expense' },
  { code: '5200', name: 'Direct Labour', account_type: 'expense' },
  { code: '5300', name: 'Subcontractor Costs', account_type: 'expense' },
  { code: '5400', name: 'Equipment Costs', account_type: 'expense' },
  { code: '5500', name: 'Overhead', account_type: 'expense' },
  { code: '5600', name: 'Salaries and Wages', account_type: 'expense' },
  { code: '5700', name: 'General and Administrative', account_type: 'expense' },
]

async function seedTestFixtures(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const company of SERVICE_COMPANIES) {
      await client.query(
        `INSERT INTO companies (id, name, legal_name, country_code, currency_code)
         VALUES ($1, $2, $2, 'IQ', 'IQD')
         ON CONFLICT (id) DO NOTHING`,
        [company.id, company.name],
      )

      for (const acct of CHART_OF_ACCOUNTS) {
        await client.query(
          `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_reconcilable)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (company_id, code) DO NOTHING`,
          [company.id, acct.code, acct.name, acct.account_type, acct.is_reconcilable ?? false],
        )
      }

      // warehouse + virtual_in + virtual_out — the same shape inventory's
      // (and gateway's) tests already query for company 001.
      const locations = [
        { name: 'Main Warehouse', code: `WH-${company.key}-01`, type: 'warehouse' },
        { name: 'Virtual Receipts', code: `VIR-${company.key}-IN`, type: 'virtual_in' },
        { name: 'Virtual Consumption', code: `VIR-${company.key}-OUT`, type: 'virtual_out' },
      ]
      for (const loc of locations) {
        await client.query(
          `INSERT INTO stock_locations (company_id, name, code, type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (company_id, code) DO NOTHING`,
          [company.id, loc.name, loc.code, loc.type],
        )
      }

      // One work_location, fixed id — hr's createTestEmployee references
      // it directly (no natural unique key on this table to ON CONFLICT
      // against, so the id itself has to be the stable, known value).
      // Same lat/long as the original seed's "Head Office - Erbil" (the
      // company-001 location hr's attendance.test.ts geofence assertions
      // were originally calibrated against) so those distance-from-
      // location checks keep working unchanged on hr's own dedicated
      // company.
      await client.query(
        `INSERT INTO work_locations (id, company_id, name, latitude, longitude, geofence_radius_m)
         VALUES ($1, $2, 'Test Office', 36.1911, 44.0092, 200)
         ON CONFLICT (id) DO NOTHING`,
        [company.workLocationId, company.id],
      )

      console.warn(`[seed-test-fixtures] ${company.key} -> ${company.id}`)
    }

    await client.query('COMMIT')
    console.warn('[seed-test-fixtures] All service test-fixture companies seeded.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[seed-test-fixtures] Failed, rolling back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

await seedTestFixtures()
