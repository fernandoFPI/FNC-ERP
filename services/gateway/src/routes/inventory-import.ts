import { Router, type IRouter } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { requireAuth } from '@fnc-erp/auth'
import { withTransaction } from '@fnc-erp/db'

export const inventoryImportRouter: IRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

const SHEET_PREFIX: Record<string, string> = {
  'Steel Store': 'STEEL',
  'General Store': 'GEN',
  'Electrical Equipment Store': 'ELEC',
  'Plumbing Store': 'PLMB',
  'PVC Store': 'PVC',
  'Paint Store': 'PAINT',
  'AC Unit Store': 'AC',
  'Furniture Store': 'FURN',
  'Work Tools Store': 'TOOL',
  'Sandwich , Plywood ,Vinyl': 'SPV',
  'Safety Store': 'SAFE',
  'General Construction Store': 'CONST',
  'Cleaning Materials Store ': 'CLEAN',
  'Outside Area Cables': 'CABLE',
}

const SHEET_SUB_CATEGORY: Record<string, string> = {
  'Steel Store': 'Steel Store',
  'General Store': 'General Store',
  'Electrical Equipment Store': 'Electrical Equipment Store',
  'Plumbing Store': 'Plumbing Store',
  'PVC Store': 'PVC Store',
  'Paint Store': 'Paint Store',
  'AC Unit Store': 'AC Unit Store',
  'Furniture Store': 'Furniture Store',
  'Work Tools Store': 'Work Tools Store',
  'Sandwich , Plywood ,Vinyl': 'Sandwich, Plywood, Vinyl',
  'Safety Store': 'Safety Store',
  'General Construction Store': 'General Construction Store',
  'Cleaning Materials Store ': 'Cleaning Materials Store',
  'Outside Area Cables': 'Outside Area Cables',
}

interface ImportItem {
  sku: string
  name: string
  description?: string
  subCat: string
  uom: string
  unitCost: number
  qty: number
}

function parseExcel(buffer: Buffer): ImportItem[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const items: ImportItem[] = []

  for (const sheetName of wb.SheetNames) {
    const prefix = SHEET_PREFIX[sheetName]
    if (!prefix) continue

    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
    const subCat = SHEET_SUB_CATEGORY[sheetName]

    let seq = 1
    for (let i = 4; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length < 3) continue

      const arabicName = String(row[1] ?? '').trim()
      const englishName = String(row[2] ?? '').trim()
      const uom = String(row[3] ?? 'EA').trim() || 'EA'
      const unitCost = parseFloat(String(row[4] ?? '0')) || 0
      const qty = parseFloat(String(row[5] ?? '0')) || 0

      if (!arabicName && !englishName) continue

      const name = englishName || arabicName
      const description = arabicName && englishName ? arabicName : undefined
      const sku = `${prefix}-${String(seq).padStart(3, '0')}`
      seq++

      const item: ImportItem = { sku, name, subCat, uom, unitCost, qty }
      if (description !== undefined) item.description = description
      items.push(item)
    }
  }

  return items
}

// POST /api/v1/admin/inventory-import
inventoryImportRouter.post('/', requireAuth(), upload.single('file'), async (req, res) => {
  if (req.auth?.role !== 'system_admin') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'System administrator access required' },
    })
    return
  }

  const { company_id, location_id } = req.body as { company_id?: string; location_id?: string }

  if (!company_id || !location_id) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'company_id and location_id are required' },
    })
    return
  }

  const uploadedFile = (req as unknown as { file?: { buffer: Buffer } }).file
  if (!uploadedFile) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Excel file (.xlsx) is required' },
    })
    return
  }

  let items: ImportItem[]
  try {
    items = parseExcel(uploadedFile.buffer)
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: 'PARSE_ERROR', message: `Failed to parse Excel: ${(err as Error).message}` },
    })
    return
  }

  if (items.length === 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'EMPTY_FILE',
        message: 'No recognised store sheets found in the uploaded file',
      },
    })
    return
  }

  let created = 0
  let updated = 0
  const errors: { sku: string; name: string; message: string }[] = []

  try {
    await withTransaction(
      { companyId: req.auth.companyId, userId: req.auth.userId, role: req.auth.role },
      async (client) => {
        for (const item of items) {
          try {
            await client.query('SAVEPOINT row_sp')

            const upsert = await client.query<{ id: string; xmax: string }>(
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
              [
                company_id,
                item.sku,
                item.name,
                item.description ?? null,
                item.subCat,
                item.uom,
                item.unitCost,
              ],
            )

            const row = upsert.rows[0]
            const wasInsert = row.xmax === '0'
            if (wasInsert) created++
            else updated++

            await client.query(
              `INSERT INTO stock_balances
                   (product_id, location_id, lot_id, qty_on_hand, qty_reserved, average_cost, updated_at)
                 VALUES ($1,$2,NULL,$3,0,$4,NOW())
                 ON CONFLICT (product_id, location_id, lot_id) DO UPDATE SET
                   qty_on_hand  = EXCLUDED.qty_on_hand,
                   average_cost = CASE WHEN EXCLUDED.average_cost > 0
                                       THEN EXCLUDED.average_cost
                                       ELSE stock_balances.average_cost END,
                   updated_at   = NOW()`,
              [row.id, location_id, item.qty, item.unitCost],
            )

            await client.query('RELEASE SAVEPOINT row_sp')
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT row_sp')
            errors.push({ sku: item.sku, name: item.name, message: (err as Error).message })
          }
        }
      },
    )
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'DB_ERROR', message: (err as Error).message },
    })
    return
  }

  res.json({
    success: true,
    data: { created, updated, errors, total: items.length },
  })
})
