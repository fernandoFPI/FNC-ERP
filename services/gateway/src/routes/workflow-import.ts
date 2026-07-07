import { Router, type IRouter } from 'express'
import multer from 'multer'
import { requireAuth } from '@fnc-erp/auth'
import { pool, type PoolClient } from '@fnc-erp/db'

export const workflowImportRouter: IRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
})

type SqlVal = string | null
type SqlRow = SqlVal[]

// ── MySQL dump parser ──────────────────────────────────────────────────────

function parseTuples(sql: string, start: number, out: SqlRow[]): number {
  let pos = start
  while (pos < sql.length) {
    while (pos < sql.length && /[\s,]/.test(sql[pos]!)) pos++
    if (sql[pos] !== '(') break
    pos++ // skip '('

    const row: SqlVal[] = []
    while (pos < sql.length) {
      while (pos < sql.length && sql[pos] === ' ') pos++
      const ch = sql[pos]
      if (ch === ')') { pos++; out.push(row); break }
      if (ch === ',') { pos++; continue }
      if (!ch) break

      if (sql.startsWith('NULL', pos)) { row.push(null); pos += 4; continue }

      if (ch === "'") {
        pos++
        let s = ''
        while (pos < sql.length) {
          const c = sql[pos]!
          if (c === '\\') {
            const nx = sql[pos + 1]
            pos += 2
            if (nx === "'") s += "'"
            else if (nx === '\\') s += '\\'
            else if (nx === 'n') s += '\n'
            else if (nx === 'r') s += '\r'
            else if (nx === 't') s += '\t'
            else s += nx ?? ''
          } else if (c === "'") { pos++; break }
          else { s += c; pos++ }
        }
        row.push(s)
        continue
      }

      let val = ''
      while (pos < sql.length && sql[pos] !== ',' && sql[pos] !== ')') { val += sql[pos]!; pos++ }
      row.push(val.trim() || null)
    }

    while (pos < sql.length && /[\s,]/.test(sql[pos]!)) {
      if (sql[pos] === ';') break
      pos++
    }
    if (pos >= sql.length || sql[pos] === ';') break
  }
  return pos
}

function extractInserts(sql: string, table: string): SqlRow[] {
  const rows: SqlRow[] = []
  // Handle both forms phpMyAdmin produces:
  //   INSERT INTO `t` VALUES (...)                  -- no column list
  //   INSERT INTO `t` (`c1`,`c2`,...) VALUES (...)  -- with column list
  const re = new RegExp(
    `INSERT\\s+INTO\\s+\`${table}\`\\s*(?:\\([\\s\\S]*?\\))?\\s*VALUES\\s*`,
    'gi',
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    parseTuples(sql, m.index + m[0].length, rows)
  }
  return rows
}

// ── Value helpers ──────────────────────────────────────────────────────────

function safeDate(v: SqlVal): string | null {
  if (!v || v.startsWith('0000') || v === '') return null
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const s = v.slice(0, 10)
    return isNaN(Date.parse(s)) ? null : s
  }
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(v)
  if (m) {
    const s = `${m[3]}-${m[2]}-${m[1]}`
    return isNaN(Date.parse(s)) ? null : s
  }
  return null
}

function safeTs(v: SqlVal): string | null {
  if (!v || v === '') return null
  // Unix timestamp stored as string
  if (/^\d{8,11}$/.test(v.trim())) {
    const ms = parseInt(v.trim(), 10) * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  const d = safeDate(v)
  return d ? `${d}T00:00:00Z` : null
}

function safeNum(v: SqlVal, fallback = 0): number {
  if (!v) return fallback
  const n = parseFloat(v)
  return isNaN(n) ? fallback : n
}

function clamp(s: SqlVal, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max) : s
}

// ── Status maps ────────────────────────────────────────────────────────────

function mapProjectStatus(code: SqlVal): string {
  switch (code) {
    case '1': return 'pending'
    case '2': return 'submitted'
    case '3': return 'ongoing'
    case '4': return 'approved'
    case '5': return 'completed'
    case '6':
    case '7': return 'cancelled'
    default:  return 'pending'
  }
}

// po_lifecycle redesign (migration 030 + 047)
function mapPoStatus(code: SqlVal): string {
  switch (code) {
    case '1': return 'opening'
    case '2': return 'pending_approval'
    case '3': return 'review'
    case '4': return 'approved'
    case '5': return 'completed'
    case '6': return 'completed'
    case '7': return 'deleted'
    default:  return 'opening'
  }
}

// project_invoices status: draft|review|approved|issued|partial|paid|cancelled
function mapInvStatus(s: SqlVal): string {
  switch (s) {
    case 'Draft':     return 'draft'
    case 'In Payment': return 'issued'
    case 'Paid':
    case 'Completed': return 'paid'
    case 'Cancelled': return 'cancelled'
    default:          return 'draft'
  }
}

// ── Batch upsert helper ────────────────────────────────────────────────────

async function batchUpsert(
  client: PoolClient,
  table: string,
  columns: string[],
  allRows: unknown[][],
  conflictExpr: string,
  batchSize = 300,
): Promise<{ imported: number; batchErrors: string[] }> {
  let imported = 0
  const batchErrors: string[] = []
  const n = columns.length

  for (let start = 0; start < allRows.length; start += batchSize) {
    const batch = allRows.slice(start, start + batchSize)
    const values: unknown[] = []
    const sets: string[] = []

    for (const row of batch) {
      const base = values.length + 1
      sets.push(`(${row.map((_, i) => `$${base + i}`).join(', ')})`)
      values.push(...row)
    }

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${sets.join(', ')} ${conflictExpr}`

    try {
      await client.query('SAVEPOINT batch_sp')
      const res = await client.query(sql, values)
      imported += res.rowCount ?? 0
      await client.query('RELEASE SAVEPOINT batch_sp')
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT batch_sp')
      batchErrors.push(`${table} @${start}: ${(err as Error).message.slice(0, 120)}`)
    }
  }

  return { imported, batchErrors }
}

// ── Endpoint ───────────────────────────────────────────────────────────────

workflowImportRouter.post(
  '/',
  requireAuth(),
  upload.single('file'),
  async (req, res) => {
    if (req.auth?.role !== 'system_admin') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'System administrator access required' } })
      return
    }

    const uploadedFile = (req as unknown as { file?: { buffer: Buffer } }).file
    if (!uploadedFile) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'SQL file is required' } })
      return
    }

    const companyId = req.auth!.companyId
    const userId    = req.auth!.userId

    let sql: string
    try {
      sql = uploadedFile.buffer.toString('utf8')
    } catch {
      res.status(400).json({ success: false, error: { code: 'PARSE_ERROR', message: 'Could not decode file as UTF-8' } })
      return
    }

    // ── Parse raw rows ───────────────────────────────────────────────────
    const rawProjects    = extractInserts(sql, 'projects')
    const rawPos         = extractInserts(sql, 'po')
    const rawPoItems     = extractInserts(sql, 'po_items')
    const rawInvoices    = extractInserts(sql, 'invoices')
    const rawInvItems    = extractInserts(sql, 'invoice_items')

    if (rawProjects.length === 0 && rawPos.length === 0 && rawInvoices.length === 0) {
      // Provide a snippet near the first INSERT to help diagnose format issues
      const idx = sql.indexOf('INSERT')
      const snippet = idx >= 0 ? sql.slice(idx, idx + 200).replace(/\n/g, '\\n') : '(no INSERT found)'
      res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_FILE',
          message: `No recognisable workflow data found — expected tables: projects, po, invoices. File size: ${sql.length} chars. First INSERT snippet: ${snippet}`,
        },
      })
      return
    }

    const stats = { projects: 0, pos: 0, poLines: 0, contracts: 0, invoices: 0, invLines: 0, skipped: 0 }
    const errors: string[] = []

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // ── Resolve Al Watanyia company (Basra branch) ────────────────────
      const wataniaRes = await client.query<{ id: string }>(
        `SELECT id FROM companies WHERE name ILIKE '%watani%' LIMIT 1`,
      )
      const wataniaCompanyId: string = wataniaRes.rows[0]?.id ?? companyId

      // ── 1. Projects ───────────────────────────────────────────────────
      // Columns: [0]id [1]ref_number [2]client_name [3]client_location [4]project_name
      //          [5]receiving_date [6]submission_date ... [13]remarks [17]project_status
      //          [18]submit_time(unix) [19]project_submit_date [20]project_approved_date
      //          [21]project_invoicing_date [22]project_complete_date [23]project_canceled_date
      //          [26]project_number [27]project_invoicing_note
      const projRows: unknown[][] = []
      // Track which project codes belong to Al Watanyia (Basra)
      const basraProjectCodes = new Set<string>()

      for (const r of rawProjects) {
        const code = r[1]?.trim()
        const name = r[4]?.trim()
        if (!code || !name) { stats.skipped++; continue }

        const isBasra = r[3]?.toLowerCase().includes('basra') ?? false
        if (isBasra) basraProjectCodes.add(code)
        const projCompanyId = isBasra ? wataniaCompanyId : companyId

        projRows.push([
          projCompanyId,
          code,
          name.slice(0, 255),
          r[27] ? clamp(r[27], 2000) : null,     // description
          mapProjectStatus(r[17]),                  // status
          r[2] ? clamp(r[2], 255) : null,          // client_name
          r[3] ? clamp(r[3], 255) : null,          // project_location
          safeDate(r[5]),                           // receiving_date
          safeDate(r[6]),                           // submission_date
          safeDate(r[5]),                           // planned_start_date
          safeDate(r[21]),                          // planned_end_date
          safeDate(r[6]),                           // actual_start_date
          safeDate(r[22]),                          // actual_end_date
          r[13] ? clamp(r[13], 2000) : null,       // remarks
          r[26] ? clamp(r[26], 100) : null,         // rfq_number
          safeTs(r[19]),                            // submitted_at
          safeTs(r[20]),                            // approved_at
          safeTs(r[22]),                            // completed_at
          safeTs(r[23]),                            // cancelled_at
          userId,                                   // created_by
          safeTs(r[18]) ?? safeTs(r[6]) ?? null,   // created_at
        ])
      }

      const { imported: pi, batchErrors: pe } = await batchUpsert(
        client,
        'projects',
        [
          'company_id','code','name','description','status',
          'client_name','project_location',
          'receiving_date','submission_date',
          'planned_start_date','planned_end_date',
          'actual_start_date','actual_end_date',
          'remarks','rfq_number',
          'submitted_at','approved_at','completed_at','cancelled_at',
          'created_by','created_at',
        ],
        projRows,
        'ON CONFLICT (company_id, code) DO NOTHING',
      )
      stats.projects = pi
      errors.push(...pe)

      // Build code → uuid map covering both the uploader's company and Al Watanyia
      const targetCompanyIds = [...new Set([companyId, wataniaCompanyId])]
      const projMapRes = await client.query<{ id: string; code: string; company_id: string }>(
        'SELECT id, code, company_id FROM projects WHERE company_id = ANY($1::uuid[])',
        [targetCompanyIds],
      )
      const projMap = new Map<string, string>()          // code → uuid
      const projCodeToCompany = new Map<string, string>() // code → company_id
      for (const r of projMapRes.rows) {
        projMap.set(r.code, r.id)
        projCodeToCompany.set(r.code, r.company_id)
      }

      // ── 2. Purchase orders ─────────────────────────────────────────────
      // Columns: [0]po_id [1]po_number [2]open_date [4]po_ref_number [5]po_status
      //          [17]approved_date [21]po_deadline
      const poRows: unknown[][] = []
      const oldPoIdToNumber = new Map<string, string>() // old integer id → po_number

      for (const r of rawPos) {
        const poNum = r[1]?.trim()
        if (!poNum) { stats.skipped++; continue }

        if (r[0]) oldPoIdToNumber.set(r[0].trim(), poNum) // old_id → po_number

        // Route PO to Al Watanyia if its linked project is a Basra project
        const refCode = r[4]?.trim()
        const poCompanyId = (refCode && basraProjectCodes.has(refCode)) ? wataniaCompanyId : companyId

        poRows.push([
          poCompanyId,
          poNum,
          mapPoStatus(r[5]),
          'USD',                          // currency_code
          1,                              // fx_rate
          0,                              // subtotal
          0,                              // tax_amount
          0,                              // total_amount
          r[4] ? 'project' : 'stock',     // purpose
          safeDate(r[21]),                // expected_delivery_date
          userId,                         // created_by
          safeDate(r[2]) ? `${safeDate(r[2])}T00:00:00Z` : null, // created_at
        ])
      }

      const { imported: poi, batchErrors: poe } = await batchUpsert(
        client,
        'purchase_orders',
        [
          'company_id','po_number','status','currency_code','fx_rate',
          'subtotal','tax_amount','total_amount','purpose',
          'expected_delivery_date','created_by','created_at',
        ],
        poRows,
        'ON CONFLICT (company_id, po_number) DO NOTHING',
      )
      stats.pos = poi
      errors.push(...poe)

      // Build po_number → new uuid map (across both companies)
      const insertedPoNumbers = [...new Set(poRows.map(r => r[1] as string))]
      const poMapRes = await client.query<{ id: string; po_number: string }>(
        'SELECT id, po_number FROM purchase_orders WHERE company_id = ANY($1::uuid[]) AND po_number = ANY($2::text[])',
        [targetCompanyIds, insertedPoNumbers],
      )
      const poNumberToUuid = new Map<string, string>()
      for (const r of poMapRes.rows) poNumberToUuid.set(r.po_number, r.id)

      // Build old_po_id → new uuid
      const oldPoIdToUuid = new Map<string, string>()
      for (const [oldId, poNum] of oldPoIdToNumber) {
        const uuid = poNumberToUuid.get(poNum)
        if (uuid) oldPoIdToUuid.set(oldId, uuid)
      }

      // Link POs to projects — update each company's POs separately
      const poLinkByCompany = new Map<string, { poNumbers: string[]; projIds: string[] }>()
      for (const r of rawPos) {
        const poNum = r[1]?.trim()
        const refCode = r[4]?.trim()
        if (!poNum || !refCode) continue
        const projUuid = projMap.get(refCode)
        if (!projUuid) continue
        const poCompId = basraProjectCodes.has(refCode) ? wataniaCompanyId : companyId
        const bucket = poLinkByCompany.get(poCompId) ?? { poNumbers: [], projIds: [] }
        bucket.poNumbers.push(poNum)
        bucket.projIds.push(projUuid)
        poLinkByCompany.set(poCompId, bucket)
      }
      for (const [cId, { poNumbers, projIds }] of poLinkByCompany) {
        await client.query(
          `UPDATE purchase_orders po
           SET linked_project_id = mapping.proj_id, project_id = mapping.proj_id, purpose = 'project'
           FROM (SELECT unnest($2::text[]) AS po_number, unnest($3::uuid[]) AS proj_id) AS mapping
           WHERE po.company_id = $1 AND po.po_number = mapping.po_number`,
          [cId, poNumbers, projIds],
        )
      }

      // ── 3. PO lines (from po_items) ────────────────────────────────────
      // Columns: [0]item_id [1]po_id(old int as str) [2]item_desc [3]item_qty
      //          [4]item_unit [8]item_price_dollar [9]item_price_dinar
      const lineCountPerPo = new Map<string, number>()
      const lineRows: unknown[][] = []

      for (const r of rawPoItems) {
        const oldPoId = r[1]?.trim()
        if (!oldPoId) { stats.skipped++; continue }
        const poUuid = oldPoIdToUuid.get(oldPoId)
        if (!poUuid) { stats.skipped++; continue }

        const desc = clamp(r[2], 500) || '(no description)'
        const qty  = Math.max(safeNum(r[3]), 0.0001)
        const uom  = clamp(r[4], 20) || 'unit'

        // Prefer dollar price, fall back to dinar
        const priceDollar = safeNum(r[8])
        const priceDinar  = safeNum(r[9])
        const unitPrice   = Math.max(0, priceDollar !== 0 ? priceDollar : priceDinar)

        const total = parseFloat((qty * unitPrice).toFixed(4))

        const lineNum = (lineCountPerPo.get(poUuid) ?? 0) + 1
        lineCountPerPo.set(poUuid, lineNum)

        lineRows.push([
          poUuid,
          lineNum,
          desc,
          qty,
          unitPrice,
          priceDollar > 0 ? 'USD' : 'IQD',
          uom,
          total,
        ])
      }

      const { imported: li, batchErrors: le } = await batchUpsert(
        client,
        'po_lines',
        ['po_id','line_number','description','qty_ordered','unit_price','currency_code','uom','total_price'],
        lineRows,
        'ON CONFLICT (po_id, line_number) DO NOTHING',
      )
      stats.poLines = li
      errors.push(...le)

      // ── 4. Invoices → project_contracts + project_invoices ─────────────
      // Group invoice_items by invoice_id
      const itemsByInvoice = new Map<string, SqlRow[]>()
      for (const r of rawInvItems) {
        const invId = r[1]
        if (!invId) continue
        const arr = itemsByInvoice.get(invId) ?? []
        arr.push(r)
        itemsByInvoice.set(invId, arr)
      }

      // Group invoices by invoice_ref_number
      const invByRef = new Map<string, SqlRow[]>()
      for (const r of rawInvoices) {
        const ref = r[5]?.trim()
        if (!ref) { stats.skipped++; continue }
        const arr = invByRef.get(ref) ?? []
        arr.push(r)
        invByRef.set(ref, arr)
      }

      for (const [refCode, invGroup] of invByRef) {
        const projUuid = projMap.get(refCode)
        if (!projUuid) {
          errors.push(`Invoice ref ${refCode}: no matching project found, skipped`)
          stats.skipped += invGroup.length
          continue
        }

        // Use the company that owns this project (Al Watanyia for Basra projects)
        const invCompanyId = projCodeToCompany.get(refCode) ?? companyId

        // Calculate total value across all invoices in this group
        let groupTotal = 0
        for (const inv of invGroup) {
          const invId  = inv[0]!
          const cur    = inv[31] ?? 'USD'
          const items  = itemsByInvoice.get(invId) ?? []
          for (const item of items) {
            groupTotal += cur === 'IQD' ? safeNum(item[9]) : safeNum(item[8])
          }
          if (groupTotal === 0) groupTotal += safeNum(inv[16]) // fallback to header total
        }

        // Create or reuse project_contract
        const contractNum   = `IMPORT-${refCode}`
        const firstInv      = invGroup[0]!
        const clientName    = clamp(firstInv[9], 255) || refCode
        const contractValue = Math.max(1, parseFloat(groupTotal.toFixed(2)))
        const contractDate  = safeDate(firstInv[3]) ?? new Date().toISOString().slice(0, 10)
        const currency      = firstInv[31] ?? 'USD'

        // Find existing contract or create
        const existingRes = await client.query<{ id: string }>(
          'SELECT id FROM project_contracts WHERE company_id = $1 AND contract_number = $2',
          [invCompanyId, contractNum],
        )

        let contractId: string
        if (existingRes.rows.length > 0) {
          contractId = existingRes.rows[0]!.id
        } else {
          try {
            const cRes = await client.query<{ id: string }>(
              `INSERT INTO project_contracts
                 (project_id, company_id, contract_number, contract_name, client_name,
                  contract_value, currency_code, default_billing_method, default_margin_pct,
                  payment_terms_days, retention_pct, contract_date, status, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'fixed_lump_sum',0,30,0,$8,'active',$9)
               RETURNING id`,
              [
                projUuid, invCompanyId, contractNum,
                `Legacy Contract — ${refCode}`,
                clientName, contractValue, currency,
                contractDate, userId,
              ],
            )
            contractId = cRes.rows[0]!.id
            stats.contracts++
          } catch (err) {
            errors.push(`Contract ${contractNum}: ${(err as Error).message.slice(0, 120)}`)
            continue
          }
        }

        // Create each invoice
        for (const inv of invGroup) {
          const invId      = inv[0]!
          const invNum     = inv[1]?.trim()
          if (!invNum) continue
          const invCur     = inv[31] ?? 'USD'
          const items      = itemsByInvoice.get(invId) ?? []
          const invDate    = safeDate(inv[3]) ?? contractDate
          const dueDate    = safeDate(inv[23]) ?? ((): string => {
            const d = new Date(invDate); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10)
          })()

          let subtotal = 0
          for (const item of items) {
            subtotal += invCur === 'IQD' ? safeNum(item[9]) : safeNum(item[8])
          }
          if (subtotal === 0) subtotal = safeNum(inv[16])

          let projInvId: string
          try {
            const iRes = await client.query<{ id: string }>(
              `INSERT INTO project_invoices
                 (contract_id, project_id, company_id, invoice_number, billing_method,
                  display_mode, subtotal, margin_total, gross_total, retention_amount, net_payable,
                  currency_code, status, invoice_date, due_date, created_by)
               VALUES ($1,$2,$3,$4,'fixed_lump_sum','summarised',
                       $5, 0, $5, 0, $5,
                       $6, $7, $8, $9, $10)
               ON CONFLICT (company_id, invoice_number) DO NOTHING
               RETURNING id`,
              [
                contractId, projUuid, invCompanyId, invNum,
                subtotal, invCur,
                mapInvStatus(inv[6]),
                invDate, dueDate, userId,
              ],
            )
            if (!iRes.rows[0]) continue // conflict — already exists
            projInvId = iRes.rows[0].id
            stats.invoices++
          } catch (err) {
            errors.push(`Invoice ${invNum}: ${(err as Error).message.slice(0, 120)}`)
            continue
          }

          // Create invoice lines
          let lineNumber = 1
          for (const item of items) {
            const desc   = clamp(item[3], 500) || '(no description)'
            const qty    = Math.max(safeNum(item[4]), 0.0001)
            const price  = invCur === 'IQD' ? safeNum(item[7]) : safeNum(item[6])
            const total  = invCur === 'IQD' ? safeNum(item[9]) : safeNum(item[8])

            try {
              await client.query(
                `INSERT INTO project_invoice_lines
                   (invoice_id, line_number, description, source_type, qty,
                    unit_cost, subtotal, margin_pct, margin_amount, line_total, currency_code)
                 VALUES ($1,$2,$3,'manual',$4,$5,$6,0,0,$6,$7)
                 ON CONFLICT (invoice_id, line_number) DO NOTHING`,
                [projInvId, lineNumber, desc, qty, price, total, invCur],
              )
              stats.invLines++
            } catch (err) {
              errors.push(`Inv line ${invNum}#${lineNumber}: ${(err as Error).message.slice(0, 80)}`)
            }
            lineNumber++
          }
        }
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: (err as Error).message } })
      return
    } finally {
      client.release()
    }

    res.json({
      success: true,
      data: {
        ...stats,
        parsed: {
          projects: rawProjects.length,
          pos: rawPos.length,
          poItems: rawPoItems.length,
          invoices: rawInvoices.length,
          invItems: rawInvItems.length,
        },
        errors,
      },
    })
  },
)
