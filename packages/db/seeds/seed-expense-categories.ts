// Fills in expense_categories against the real, detailed 3000-series Chart
// of Accounts (the one with Employee Costs/Materials/Subcontractors/Fuel/
// Maintenance/Marketing/Transport/Rentals/Professional Fees broken out) that
// all 3 companies already share. Only ~4 categories existed before this —
// Insurance, Other Authorized Expenses (plus a near-duplicate), Gas & Fuel,
// Employee Salary — leaving ~130 real expense accounts unreachable by any
// category. This adds the subset that actually makes sense as something an
// employee pays out of pocket and claims back (travel, fuel, meals,
// supplies, medical, admin) — NOT payroll (3111-xx — posts via payroll
// runs), direct project materials/subcontracting (3211-3238 — posts via
// Purchase Orders), depreciation, finance costs, or rentals (3370-3384,
// 3351-3355 — each already posts through its own dedicated flow).
//
// Idempotent: safe to re-run. Existing categories matching by (company_id,
// name) get their gl_account_id corrected if it drifts; nothing is deleted.
//
// Two narrow, data-verified fixes to pre-existing categories are included
// (see FIXES below) — everything else found questionable during the audit
// (Gas & Fuel pointing at the narrow "Gas" account instead of the broader
// "Fuel and Lubricants" parent; Employee Salary pointing at an inactive
// -LEGACY account) was deliberately left untouched: both have real
// historical expense_claim_lines against them (18 total for Employee
// Salary, 5 for Gas & Fuel at Al Watanyia), so remapping or deactivating
// them is a business decision for a human, not something to silently do
// in a seed.
import { query } from '../src/index.js'

const COMPANY_IDS = {
  YAKAM: '00000000-0000-0000-0000-000000000001',
  FACTORY: '00000000-0000-0000-0000-000000000002',
  WATANYIA: '00000000-0000-0000-0000-000000000003',
}

interface CategoryDef {
  name: string
  code: string
}

const CATEGORIES: CategoryDef[] = [
  // Travel & Transport
  { name: 'Travel & Missions', code: '3343' },
  { name: 'Employee Transportation', code: '3341' },
  { name: 'Visas & Work Permits', code: '3346' },
  // Fuel (granular — existing "Gas & Fuel" is left as-is, see header)
  { name: 'Petrol', code: '3221' },
  { name: 'Diesel', code: '3222' },
  { name: 'Lubricants', code: '3224' },
  { name: 'Vehicle Oil Change', code: '3244' },
  // Meals, Hospitality & Marketing
  { name: 'Meals & Hospitality', code: '3333' },
  { name: 'Gifts & Public Relations', code: '3335' },
  { name: 'Advertising & Publications', code: '3331' },
  // Supplies, Tools & Training
  { name: 'Stationery & Printing', code: '3252' },
  { name: 'Small Tools & Work Materials', code: '3251' },
  { name: 'Training Materials', code: '3253' },
  { name: 'HSE Training & Certifications', code: '3265' },
  // Medical & Safety
  { name: 'Medical & Pharmacy', code: '3263' },
  { name: 'PPE & Workwear', code: '3261' },
  // Admin & Communications
  { name: 'Communications & Internet', code: '3344' },
  { name: 'Government Fees & Licenses', code: '3368' },
  { name: 'Subscriptions', code: '3361' },
]

// Narrow, data-verified fixes to pre-existing categories (Nishtimani Yakam
// only — the other 2 companies don't have these specific rows):
//   - "NISHTIMANI YAKAM" is a stray duplicate of "OTHER AUTHORIZED EXPENSES"
//     (both point at account 3369) with exactly 1 historical claim line —
//     deactivated rather than deleted, so that line keeps a valid category.
//   - "Site materials" points at 5100-LEGACY, an inactive account — remapped
//     to the active 3214 "Miscellaneous Materials and Services". Safe for
//     its 2 historical claim lines: expense_claim_lines stores its own
//     gl_account_id at submission time, so this only changes where FUTURE
//     submissions under this category post, never past ones.
const DEACTIVATE_DUPLICATE = { companyId: COMPANY_IDS.YAKAM, name: 'NISHTIMANI YAKAM' }
const REMAP_SITE_MATERIALS = { companyId: COMPANY_IDS.YAKAM, name: 'Site materials', newCode: '3214' }

async function seedExpenseCategories(): Promise<void> {
  console.log('[seed-expense-categories] Upserting expense categories...')

  let upserted = 0
  let missingAccount = 0

  for (const [, companyId] of Object.entries(COMPANY_IDS)) {
    for (const cat of CATEGORIES) {
      const acct = await query<{ id: string }>(
        `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code=$2`,
        [companyId, cat.code],
      )
      const accountId = acct.rows[0]?.id
      if (!accountId) {
        console.warn(
          `[seed-expense-categories]   SKIPPED "${cat.name}" for company ${companyId} — no account with code ${cat.code}`,
        )
        missingAccount++
        continue
      }
      await query(
        `INSERT INTO expense_categories (company_id, name, gl_account_id, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (company_id, name) DO UPDATE
           SET gl_account_id = EXCLUDED.gl_account_id, is_active = true`,
        [companyId, cat.name, accountId],
      )
      upserted++
    }
  }

  console.log(`[seed-expense-categories] Done. ${upserted} upserted, ${missingAccount} skipped (no matching account)`)

  const deactivated = await query(
    `UPDATE expense_categories SET is_active = false WHERE company_id=$1 AND name=$2`,
    [DEACTIVATE_DUPLICATE.companyId, DEACTIVATE_DUPLICATE.name],
  )
  console.log(
    `[seed-expense-categories] Deactivated "${DEACTIVATE_DUPLICATE.name}" duplicate: ${deactivated.rowCount ?? 0} row(s)`,
  )

  const remapAcct = await query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code=$2`,
    [REMAP_SITE_MATERIALS.companyId, REMAP_SITE_MATERIALS.newCode],
  )
  const remapAccountId = remapAcct.rows[0]?.id
  if (remapAccountId) {
    const remapped = await query(
      `UPDATE expense_categories SET gl_account_id=$1 WHERE company_id=$2 AND name=$3`,
      [remapAccountId, REMAP_SITE_MATERIALS.companyId, REMAP_SITE_MATERIALS.name],
    )
    console.log(
      `[seed-expense-categories] Remapped "${REMAP_SITE_MATERIALS.name}" to account ${REMAP_SITE_MATERIALS.newCode}: ${remapped.rowCount ?? 0} row(s)`,
    )
  } else {
    console.warn(
      `[seed-expense-categories]   SKIPPED remap of "${REMAP_SITE_MATERIALS.name}" — no account with code ${REMAP_SITE_MATERIALS.newCode}`,
    )
  }
}

seedExpenseCategories()
  .then(() => {
    console.log('[seed-expense-categories] Complete')
    process.exit(0)
  })
  .catch((err) => {
    console.error('[seed-expense-categories] Failed:', err)
    process.exit(1)
  })
