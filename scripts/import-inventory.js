#!/usr/bin/env node
/**
 * Store Inventory Excel Import Script
 *
 * Usage:
 *   node scripts/import-inventory.js \
 *     --file "Store Inventory 2025.xlsx" \
 *     --company-id <uuid> \
 *     --location-id <uuid> \
 *     [--dry-run]
 *
 * Requires:  xlsx   (npm install xlsx)
 *            pg     (already a project dependency)
 *
 * What it does:
 *   - Reads every store sheet in the Excel file
 *   - Sheet name  →  sub_category  (e.g. "Steel Store")
 *   - category is always "raw_material"
 *   - Auto-generates SKU as PREFIX-NNN  (e.g. STEEL-001)
 *   - Upserts products ON CONFLICT (company_id, sku) → UPDATE
 *   - Upserts stock_balances for the chosen location ON CONFLICT → UPDATE qty_on_hand
 *   - Zero-qty rows are still imported as products with 0 balance
 */

const XLSX = require('xlsx')
const { Client } = require('pg')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name) {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}
const FILE       = getArg('--file')       || 'Store Inventory 2025.xlsx'
const COMPANY_ID = getArg('--company-id')
const LOCATION_ID= getArg('--location-id')
const DRY_RUN    = args.includes('--dry-run')

if (!COMPANY_ID || !LOCATION_ID) {
  console.error('Usage: node scripts/import-inventory.js --file <path> --company-id <uuid> --location-id <uuid> [--dry-run]')
  process.exit(1)
}

// ─── Sheet → SKU prefix mapping ──────────────────────────────────────────────
const SHEET_PREFIX = {
  'Steel Store':                    'STEEL',
  'General Store':                  'GEN',
  'Electrical Equipment Store':     'ELEC',
  'Plumbing Store':                 'PLMB',
  'PVC Store':                      'PVC',
  'Paint Store':                    'PAINT',
  'AC Unit Store':                  'AC',
  'Furniture Store':                'FURN',
  'Work Tools Store':               'TOOL',
  'Sandwich , Plywood ,Vinyl':      'SPV',   // exact sheet name from file
  'Safety Store':                   'SAFE',
  'General Construction Store':     'CONST',
  'Cleaning Materials Store ':      'CLEAN', // trailing space in file
  'Outside Area Cables':            'CABLE',
}

// Normalised sub_category label stored in DB (trimmed, consistent)
const SHEET_SUB_CATEGORY = {
  'Steel Store':                    'Steel Store',
  'General Store':                  'General Store',
  'Electrical Equipment Store':     'Electrical Equipment Store',
  'Plumbing Store':                 'Plumbing Store',
  'PVC Store':                      'PVC Store',
  'Paint Store':                    'Paint Store',
  'AC Unit Store':                  'AC Unit Store',
  'Furniture Store':                'Furniture Store',
  'Work Tools Store':               'Work Tools Store',
  'Sandwich , Plywood ,Vinyl':      'Sandwich, Plywood, Vinyl',
  'Safety Store':                   'Safety Store',
  'General Construction Store':     'General Construction Store',
  'Cleaning Materials Store ':      'Cleaning Materials Store',
  'Outside Area Cables':            'Outside Area Cables',
}

// ─── Parse Excel ─────────────────────────────────────────────────────────────
function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath)
  const items = []

  for (const sheetName of wb.SheetNames) {
    const prefix = SHEET_PREFIX[sheetName]
    if (!prefix) continue  // skip Summary and unknown sheets

    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    const subCat = SHEET_SUB_CATEGORY[sheetName]

    // Data starts at row index 4 (rows 0-3 are header/title)
    let seq = 1
    for (let i = 4; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length < 3) continue

      const arabicName   = String(row[1] ?? '').trim()
      const englishName  = String(row[2] ?? '').trim()
      const uom          = String(row[3] ?? 'EA').trim() || 'EA'
      const unitCost     = parseFloat(row[4]) || 0
      const qty          = parseFloat(row[5]) || 0

      // Skip completely empty rows (no name at all)
      if (!arabicName && !englishName) continue

      const name = englishName || arabicName  // prefer English
      const description = arabicName && englishName ? arabicName : undefined
      const sku = `${prefix}-${String(seq).padStart(3, '0')}`
      seq++

      items.push({ sku, name, description, subCat, uom, unitCost, qty })
    }
  }

  return items
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const filePath = path.resolve(FILE)
  console.log(`\n📂  Reading: ${filePath}`)
  const items = parseExcel(filePath)
  console.log(`📋  Parsed ${items.length} products across all store sheets`)

  if (DRY_RUN) {
    console.log('\n🔍  DRY RUN — no changes will be written\n')
    items.slice(0, 10).forEach((it) =>
      console.log(`  [${it.sku}] ${it.name.substring(0, 50)}  qty=${it.qty}  cost=${it.unitCost}  store=${it.subCat}`)
    )
    if (items.length > 10) console.log(`  … and ${items.length - 10} more`)
    return
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  console.log('🔗  Connected to database\n')

  let created = 0, updated = 0, errors = 0

  await db.query('BEGIN')
  try {
    for (const item of items) {
      try {
        // Upsert product
        const res = await db.query(
          `INSERT INTO products
             (company_id, sku, name, description, category, sub_category, uom,
              valuation_method, standard_cost, average_cost, is_active)
           VALUES ($1,$2,$3,$4,'raw_material',$5,$6,'avco',$7,$7,true)
           ON CONFLICT (company_id, sku) DO UPDATE SET
             name          = EXCLUDED.name,
             description   = COALESCE(EXCLUDED.description, products.description),
             sub_category  = EXCLUDED.sub_category,
             uom           = EXCLUDED.uom,
             standard_cost = EXCLUDED.standard_cost,
             updated_at    = NOW()
           RETURNING id, xmax`,
          [COMPANY_ID, item.sku, item.name, item.description ?? null,
           item.subCat, item.uom, item.unitCost]
        )

        const row = res.rows[0]
        const productId = row.id
        const wasInsert = row.xmax === '0' || row.xmax === 0

        if (wasInsert) created++; else updated++

        // Upsert stock balance
        await db.query(
          `INSERT INTO stock_balances
             (product_id, location_id, lot_id, qty_on_hand, qty_reserved, average_cost, updated_at)
           VALUES ($1, $2, NULL, $3, 0, $4, NOW())
           ON CONFLICT (product_id, location_id, lot_id) DO UPDATE SET
             qty_on_hand  = EXCLUDED.qty_on_hand,
             average_cost = CASE WHEN EXCLUDED.average_cost > 0 THEN EXCLUDED.average_cost
                                 ELSE stock_balances.average_cost END,
             updated_at   = NOW()`,
          [productId, LOCATION_ID, item.qty, item.unitCost]
        )
      } catch (err) {
        console.error(`  ❌  [${item.sku}] ${item.name}: ${err.message}`)
        errors++
      }
    }

    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  } finally {
    await db.end()
  }

  console.log('✅  Import complete')
  console.log(`   Created : ${created}`)
  console.log(`   Updated : ${updated}`)
  console.log(`   Errors  : ${errors}`)
  console.log(`   Total   : ${items.length}`)
}

main().catch((err) => {
  console.error('\n💥  Fatal error:', err.message)
  process.exit(1)
})
