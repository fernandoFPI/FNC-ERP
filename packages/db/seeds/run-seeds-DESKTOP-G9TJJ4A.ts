import { Pool } from 'pg'
import bcrypt from 'bcrypt'
import { seedCompanies, companies } from './001_companies.js'
import { seedChartOfAccounts } from './002_chart_of_accounts.js'
import { seedStockLocations } from './003_stock_locations.js'
import { seedFxRates } from './004_fx_rates.js'
import { seedHR } from './005_hr_seed.js'
import { seedManufacturing } from './006_manufacturing_seed.js'
import { seedProjects } from './007_projects_seed.js'
import { seedInvoicing } from './008_invoicing_seed.js'
import { seedCompanyRoles } from './010_company_roles_seed.js'

const connectionString =
  process.env['NODE_ENV'] === 'test'
    ? (process.env['DATABASE_TEST_URL'] ?? process.env['DATABASE_URL'])
    : process.env['DATABASE_URL']

if (!connectionString) {
  console.error('[seed] DATABASE_URL is not set')
  process.exit(1)
}

const pool = new Pool({ connectionString })

const ADMIN_EMAIL = 'admin@fnc-erp.local'
const ADMIN_PASSWORD_PLAIN = 'ChangeMe123!'

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

async function runSeeds() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await seedCompanies(client)

    // Check if admin already exists
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL])

    let adminId: string

    if ((existing.rowCount ?? 0) === 0) {
      const passwordHash = await hashPassword(ADMIN_PASSWORD_PLAIN)
      const result = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, is_active)
         VALUES ($1, $2, true)
         RETURNING id`,
        [ADMIN_EMAIL, passwordHash],
      )
      adminId = result.rows[0]?.id ?? ''
      console.warn(`[seed] System admin user created: ${ADMIN_EMAIL}`)
      console.warn(`[seed] IMPORTANT: Change the admin password on first login!`)
    } else {
      adminId = (existing.rows[0] as { id: string }).id
      console.warn(`[seed] System admin already exists, skipping user creation`)
    }

    // Grant system_admin role for all three companies
    for (const company of companies) {
      await client.query(
        `INSERT INTO user_company_roles (user_id, company_id, role, module, is_active)
         VALUES ($1, $2, 'system_admin', 'all', true)
         ON CONFLICT (user_id, company_id, module) DO NOTHING`,
        [adminId, company.id],
      )
    }
    console.warn(`[seed] System admin roles assigned to all 3 companies`)

    await seedChartOfAccounts(client)
    await seedStockLocations(client)
    await seedFxRates(client)
    await seedHR(client)
    await seedManufacturing(client)
    await seedProjects(client, adminId)
    await seedInvoicing(client, adminId)
    await seedCompanyRoles(client, ADMIN_EMAIL)

    await client.query('COMMIT')
    console.warn('[seed] All seeds applied successfully.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[seed] Seeding failed, rolling back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

await runSeeds()
