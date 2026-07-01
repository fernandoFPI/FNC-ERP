#!/usr/bin/env node
/**
 * One-time data migration: workflow.sql (MariaDB / phpMyAdmin dump) → FNC ERP PostgreSQL
 *
 * Migrates:
 *   projects      → projects + project_contracts (one contract per project)
 *   invoices      → project_invoices  (outgoing AR invoices to clients)
 *   invoice_items → project_invoice_lines
 *   po            → purchase_orders   (internal procurement POs)
 *   po_items      → po_lines
 *
 * Run from repo root:
 *   npx tsx packages/db/scripts/migrate_workflow.ts
 *
 * Requires DATABASE_URL in .env (project root).
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// Load .env manually (avoid dotenv dependency issues)
const envPath = join(__dirname, '../../../.env')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// ── Status Mappings (from workflow keyword table) ──────────────

const VALID_PO_STATUSES = new Set([
  'opening','inventory_check','store_pricing','market_pricing',
  'price_verification','review','pending_approval','dept_assigned',
  'approved','completed','deleted',
])

const VALID_PROJECT_STATUSES = new Set([
  'pending','submitted','approved','ongoing','completed','cancelled',
  'cancelled_after_approval','on_hold',
])

const PO_STATUS: Record<string, string> = {
  '1':  'opening',             // PO at Opening/Inventory
  '2':  'market_pricing',      // PO at Pricing
  '22': 'price_verification',  // PO at checking price
  '3':  'review',              // PO at review
  '4':  'pending_approval',    // PO at Need Approval
  '8':  'approved',            // PO at Approved
  '5':  'completed',           // PO completed
  '7':  'deleted',             // PO deleted
  '9':  'store_pricing',       // PO at store pricing
  '10': 'dept_assigned',       // PO at Need DepartmentApproval
}

const PROJECT_STATUS: Record<string, string> = {
  '1': 'pending',     // Opening (maps to pending in redesigned schema)
  '2': 'submitted',
  '3': 'approved',    // Approved
  '4': 'completed',
  '5': 'cancelled',
}

const INVOICE_STATUS: Record<string, string> = {
  'Draft':     'draft',
  'In Payment':'issued',
  'Paid':      'paid',
  'Completed': 'paid',
  'Cancelled': 'cancelled',
}

// ── Client Name Normalizer ─────────────────────────────────────

const CLIENT_MAP: Array<[RegExp, string]> = [
  [/total.?energ/i,              'TotalEnergies EP Ratawi Hub SAS'],
  [/control.?risks?/i,           'Control Risks'],
  [/^uk.?army/i,                 'UK Army'],
  [/^kbr/i,                      'KBR'],
  [/^geg/i,                      'GEG'],
  [/al.?waha.?petroleum/i,        'Al Waha Petroleum'],
  [/alMansoori|al.?mansoori/i,    'AlMansoori Petroleum Services'],
  [/taqa.?well|^taqa/i,           'TAQA Well Solutions'],
  [/national.?petroleum/i,        'National Petroleum Services'],
  [/save.?the.?children/i,        'Save the Children'],
  [/exxon/i,                      'ExxonMobil'],
  [/gazprom/i,                    'Gazprom'],
  [/aecom/i,                      'AECOM'],
  [/serco/i,                      'Serco'],
  [/northrop/i,                   'Northrop Grumman'],
  [/oil.?serv/i,                  'Oil Serv'],
  [/genel/i,                      'Genel Energy'],
  [/italians?.?army/i,            'Italian Army'],
  [/french.?army/i,               'French Army'],
  [/central.?bank/i,              'Central Bank of Iraq'],
  [/huntoil/i,                    'Huntoil'],
  [/dno/i,                        'DNO'],
  [/^goc/i,                       'GOC'],
  [/^gog/i,                       'GOG'],
  [/^rnk?$/i,                     'RN'],
  [/^usg/i,                       'USG'],
  [/^gdit/i,                      'GDIT'],
]

function normalizeClient(raw: string | null | undefined): string {
  if (!raw) return 'Unknown Client'
  const n = raw.trim()
  for (const [pattern, canonical] of CLIENT_MAP) {
    if (pattern.test(n)) return canonical
  }
  // Remove trailing "/ Person Name" contact suffix
  return n.split('/')[0].split('\\')[0].trim().slice(0, 255) || 'Unknown Client'
}

// ── Date Parser ────────────────────────────────────────────────

function parseDate(d: string | number | null | undefined): string | null {
  if (d === null || d === undefined) return null
  const s = String(d).trim()
  if (!s || s === '0000-00-00' || s === 'NULL') return null

  let result: string | null = null

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) result = s
  // DD-MM-YYYY
  else if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('-')
    result = `${yyyy}-${mm}-${dd}`
  }
  // Unix timestamp (10 digits)
  else if (/^\d{10}$/.test(s)) result = new Date(parseInt(s) * 1000).toISOString().split('T')[0]!
  // DateTime with | like "08-07-2021 | 02:53"
  else if (s.includes('|')) result = parseDate(s.split('|')[0]!.trim())
  else {
    // Try generic parse — only accept if it yields a sane result
    try {
      const dt = new Date(s)
      if (!isNaN(dt.getTime())) result = dt.toISOString().split('T')[0]!
    } catch { /* ignore */ }
  }

  if (!result) return null

  // Sanity-check the year (1990–2099)
  const year = parseInt(result.slice(0, 4), 10)
  if (isNaN(year) || year < 1990 || year > 2099) return null

  return result
}

function toTs(d: string | number | null | undefined): string | null {
  const dt = parseDate(d)
  return dt ? `${dt}T00:00:00Z` : null
}

// ── SQL Dump Parser ────────────────────────────────────────────

type SqlValue = string | number | null

/** Scan forward through SQL text (aware of single-quoted strings) to find the `;`
 *  that terminates an INSERT statement. Returns the index of that `;`. */
function findInsertEnd(sql: string, from: number): number {
  let i = from
  const len = sql.length
  while (i < len) {
    if (sql[i] === "'") {
      i++ // skip opening quote
      while (i < len) {
        if (sql[i] === '\\') { i += 2 }
        else if (sql[i] === "'") { i++; break }
        else i++
      }
    } else if (sql[i] === ';') {
      return i
    } else {
      i++
    }
  }
  return len
}

function extractTable(sql: string, tableName: string): { cols: string[]; rows: SqlValue[][] } {
  const marker = `INSERT INTO \`${tableName}\` (`
  let searchFrom = 0
  let cols: string[] = []
  const allRows: SqlValue[][] = []

  while (true) {
    const start = sql.indexOf(marker, searchFrom)
    if (start === -1) break

    // Extract column names (only needed once — same for every block)
    const colStart = start + marker.length
    const colEnd   = sql.indexOf(')', colStart)
    if (cols.length === 0) {
      cols = sql.slice(colStart, colEnd).split(',').map(c => c.trim().replace(/`/g, ''))
    }

    // Find VALUES keyword for this block
    const valuesIdx = sql.indexOf('VALUES\n', colEnd)
    if (valuesIdx === -1) break

    // Find the semicolon that ends this specific INSERT block
    const semiIdx = findInsertEnd(sql, valuesIdx + 7)

    const section = sql.slice(valuesIdx + 7, semiIdx)
    allRows.push(...parseValues(section))

    searchFrom = semiIdx + 1  // continue scanning for more INSERT blocks
  }

  return { cols, rows: allRows }
}

function parseValues(section: string): SqlValue[][] {
  const rows: SqlValue[][] = []
  let i = 0
  const len = section.length

  while (i < len) {
    // Skip to opening paren
    while (i < len && section[i] !== '(') i++
    if (i >= len) break
    i++ // consume '('

    const row: SqlValue[] = []

    rowLoop: while (i < len) {
      // Skip horizontal whitespace
      while (i < len && (section[i] === ' ' || section[i] === '\t')) i++
      if (i >= len) break

      const c = section[i]

      if (c === ')') { i++; break rowLoop }

      if (c === "'") {
        // Quoted string
        i++
        let str = ''
        while (i < len) {
          const ch = section[i]!
          if (ch === '\\') {
            const nx = section[i + 1]
            switch (nx) {
              case "'":  str += "'";  i += 2; break
              case '\\': str += '\\'; i += 2; break
              case 'n':  str += '\n'; i += 2; break
              case 'r':  str += '\r'; i += 2; break
              case 't':  str += '\t'; i += 2; break
              default:   str += ch;   i++
            }
          } else if (ch === "'") {
            i++; break
          } else {
            str += ch; i++
          }
        }
        row.push(str)
      } else if (section.slice(i, i + 4).toUpperCase() === 'NULL') {
        row.push(null); i += 4
      } else {
        // Number or bare word
        let raw = ''
        while (i < len && section[i] !== ',' && section[i] !== ')' && section[i] !== ' ' && section[i] !== '\t') {
          raw += section[i]; i++
        }
        const num = parseFloat(raw)
        row.push(isNaN(num) ? (raw || null) : num)
      }

      // Skip to comma or close paren
      while (i < len && (section[i] === ' ' || section[i] === '\t')) i++
      if (i < len && section[i] === ',') i++
    }

    if (row.length > 0) rows.push(row)
  }

  return rows
}

function toRec(cols: string[], row: SqlValue[]): Record<string, SqlValue> {
  const rec: Record<string, SqlValue> = {}
  cols.forEach((c, idx) => { rec[c] = row[idx] ?? null })
  return rec
}

// ── Helper ─────────────────────────────────────────────────────

function str(v: SqlValue, max = 255): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

function num(v: SqlValue, fallback = 0): number {
  const n = parseFloat(String(v ?? fallback))
  return isNaN(n) ? fallback : n
}

// ── Main Migration ─────────────────────────────────────────────

async function migrate() {
  console.log('Reading workflow.sql …')
  const sqlPath = join(__dirname, '../../../workflow.sql')
  const sql = readFileSync(sqlPath, 'utf8')

  // Extract all needed tables from the dump
  const T = {
    projects:     extractTable(sql, 'projects'),
    po:           extractTable(sql, 'po'),
    poItems:      extractTable(sql, 'po_items'),
    invoices:     extractTable(sql, 'invoices'),
    invoiceItems: extractTable(sql, 'invoice_items'),
  }

  console.log(`Parsed rows — projects: ${T.projects.rows.length}, po: ${T.po.rows.length}, ` +
    `po_items: ${T.poItems.rows.length}, invoices: ${T.invoices.rows.length}, ` +
    `invoice_items: ${T.invoiceItems.rows.length}`)

  const projects     = T.projects.rows.map(r => toRec(T.projects.cols, r))
  const poRows       = T.po.rows.map(r => toRec(T.po.cols, r))
  const poItemRows   = T.poItems.rows.map(r => toRec(T.poItems.cols, r))
  const invoices     = T.invoices.rows.map(r => toRec(T.invoices.cols, r))
  const invoiceItems = T.invoiceItems.rows.map(r => toRec(T.invoiceItems.cols, r))

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // ── System IDs ─────────────────────────────────────────
    const cmpRes = await client.query<{ id: string }>('SELECT id FROM companies ORDER BY created_at LIMIT 1')
    if (!cmpRes.rows[0]) throw new Error('No companies found — run database migrations first')
    const companyId = cmpRes.rows[0].id

    const usrRes = await client.query<{ id: string }>(
      `SELECT id FROM users ORDER BY created_at LIMIT 1`
    )
    if (!usrRes.rows[0]) throw new Error('No users found')
    const sysUserId = usrRes.rows[0].id

    console.log(`→ Company: ${companyId}`)
    console.log(`→ System user: ${sysUserId}`)

    // ── Legacy vendor placeholder (for POs without a supplier) ─
    const lvRes = await client.query<{ id: string }>(
      `INSERT INTO vendors (company_id, name, legal_name, currency_code, country_code, is_active)
       VALUES ($1, 'Legacy — Vendor TBD', 'Legacy — Vendor TBD', 'USD', 'IQ', true)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [companyId]
    )
    const legacyVendorId: string = lvRes.rows[0]?.id
      ?? (await client.query<{ id: string }>(
          `SELECT id FROM vendors WHERE name = 'Legacy — Vendor TBD' AND company_id = $1`, [companyId]
         )).rows[0]!.id

    // ── 1. Migrate projects ────────────────────────────────
    console.log('\n[1/5] Migrating projects …')
    const codeToProjectId: Record<string, string> = {}  // ref_number → new UUID

    for (const p of projects) {
      const code = str(p.ref_number, 50)
      if (!code) continue

      const rawProjStatus = PROJECT_STATUS[String(p.project_status ?? '1')] ?? 'pending'
      const status = VALID_PROJECT_STATUSES.has(rawProjStatus) ? rawProjStatus : 'pending'
      const client_name = normalizeClient(str(p.client_name))
      const startDate   = parseDate(p.receiving_date) ?? parseDate(p.submission_date)
      const endDate     = parseDate(p.project_complete_date) ?? parseDate(p.project_canceled_date)

      const res = await client.query<{ id: string }>(
        `INSERT INTO projects
           (company_id, code, name, description, project_type, status,
            client_name, client_contact, planned_start_date, planned_end_date,
            actual_end_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (company_id, code) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           client_name = EXCLUDED.client_name,
           updated_at = NOW()
         RETURNING id`,
        [
          companyId, code,
          str(p.project_name, 255) ?? code,
          str(p.remarks, 1000),
          'construction',
          status,
          client_name,
          str(p.client_location, 255),
          startDate,
          parseDate(p.submission_date),
          endDate,
          sysUserId,
        ]
      )
      if (res.rows[0]) codeToProjectId[code] = res.rows[0].id
    }
    console.log(`  → ${Object.keys(codeToProjectId).length} projects`)

    // ── 2. Create project_contracts (one per project) ──────
    console.log('[2/5] Creating project contracts …')
    const projectIdToContractId: Record<string, string> = {}

    for (const [code, projectId] of Object.entries(codeToProjectId)) {
      const p = projects.find(r => str(r.ref_number, 50) === code)
      const clientName   = normalizeClient(str(p?.client_name))
      const contractDate = parseDate(p?.receiving_date) ?? parseDate(p?.submission_date) ?? '2020-01-01'

      // contract_value must be > 0 (CHECK constraint)
      const contractValue = 1  // placeholder — real values are in invoice lines

      const res = await client.query<{ id: string }>(
        `INSERT INTO project_contracts
           (project_id, company_id, contract_number, contract_name, client_name,
            contract_value, currency_code, default_billing_method,
            payment_terms_days, contract_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (company_id, contract_number) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [
          projectId, companyId,
          code,  // contract_number = project ref_number
          str(p?.project_name, 255) ?? code,
          clientName,
          contractValue,
          'USD',
          'milestone',
          30,
          contractDate,
          'active',
          sysUserId,
        ]
      )
      if (res.rows[0]) projectIdToContractId[projectId] = res.rows[0].id
    }
    console.log(`  → ${Object.keys(projectIdToContractId).length} contracts`)

    // ── 3. Migrate invoices → project_invoices ─────────────
    console.log('[3/5] Migrating invoices …')
    const oldInvToNew: Record<string, string> = {}

    for (const inv of invoices) {
      const invNum  = str(inv.invoice_number, 100)
      const refNum  = str(inv.invoice_ref_number, 50) ?? ''
      const invDate = parseDate(inv.open_date) ?? '2026-01-01'
      const dueDate = parseDate(inv.invoice_deadline) ?? invDate
      const currency = str(inv.currency, 3) ?? 'USD'
      const clientName = normalizeClient(str(inv.supplier))

      if (!invNum) continue

      // Find or create the project
      let projectId = codeToProjectId[refNum]

      if (!projectId && refNum) {
        // Invoice references a project not yet in the new system — create it
        const projName = str(inv.project_name, 255) ?? str(inv.job_description, 255) ?? refNum
        const r = await client.query<{ id: string }>(
          `INSERT INTO projects
             (company_id, code, name, project_type, status, client_name,
              planned_start_date, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
           RETURNING id`,
          [
            companyId, refNum, projName, 'construction',
            INVOICE_STATUS[String(inv.invoice_status)] === 'paid' ? 'completed' : 'ongoing',
            clientName, invDate, sysUserId,
          ]
        )
        projectId = r.rows[0]?.id
        if (projectId) codeToProjectId[refNum] = projectId
      }

      if (!projectId) continue

      // Find or create contract
      let contractId = projectIdToContractId[projectId]

      if (!contractId) {
        const contractNum = refNum || invNum
        const totalAmt = num(inv.total_amount, 1) || 1
        const r = await client.query<{ id: string }>(
          `INSERT INTO project_contracts
             (project_id, company_id, contract_number, contract_name, client_name,
              contract_value, currency_code, default_billing_method,
              payment_terms_days, contract_date, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (company_id, contract_number) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [
            projectId, companyId,
            contractNum,
            str(inv.project_name, 255) ?? contractNum,
            clientName,
            totalAmt, currency, 'milestone', 30, invDate, 'active', sysUserId,
          ]
        )
        contractId = r.rows[0]?.id
        if (contractId) projectIdToContractId[projectId] = contractId
      }

      if (!contractId) continue

      const status   = INVOICE_STATUS[String(inv.invoice_status)] ?? 'draft'
      const subtotal = num(inv.subtotal)
      const total    = num(inv.total_amount)
      const credit   = num(inv.credit_amount)  // credit balance = retention-like deduction
      const discount = num(inv.discount_amount)

      const r = await client.query<{ id: string }>(
        `INSERT INTO project_invoices
           (contract_id, project_id, company_id, invoice_number, billing_method,
            subtotal, margin_total, gross_total, retention_amount, net_payable,
            currency_code, status, invoice_date, due_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (company_id, invoice_number) DO NOTHING
         RETURNING id`,
        [
          contractId, projectId, companyId,
          invNum, 'milestone',
          subtotal, 0, total,
          credit,                        // credit_amount treated as retention deduction
          Math.max(0, total - credit - discount),
          currency, status,
          invDate, dueDate, sysUserId,
        ]
      )
      if (r.rows[0]) oldInvToNew[String(inv.invoice_id)] = r.rows[0].id
    }
    console.log(`  → ${Object.keys(oldInvToNew).length} invoices`)

    // ── 4. Migrate invoice_items → project_invoice_lines ───
    console.log('[4/5] Migrating invoice lines …')
    let invLineCount = 0

    // Group items by invoice
    const itemsByInv: Record<string, typeof invoiceItems> = {}
    for (const item of invoiceItems) {
      const k = String(item.invoice_id)
      if (!itemsByInv[k]) itemsByInv[k] = []
      itemsByInv[k]!.push(item)
    }

    for (const [oldId, items] of Object.entries(itemsByInv)) {
      const newInvId = oldInvToNew[oldId]
      if (!newInvId) continue

      const oldInv  = invoices.find(r => String(r.invoice_id) === oldId)
      const isUSD   = String(oldInv?.currency ?? 'USD').toUpperCase() !== 'IQD'

      let lineNum = 1
      for (const item of items) {
        const qty        = num(item.item_qty, 1) || 1
        const unitPrice  = isUSD ? num(item.item_price_dollar) : num(item.item_price_dinar)
        const rawTotal   = isUSD ? num(item.item_total_dollar) : num(item.item_total_dinar)
        const lineTotal  = rawTotal || (unitPrice * qty)

        await client.query(
          `INSERT INTO project_invoice_lines
             (invoice_id, line_number, description, source_type,
              qty, unit_cost, subtotal, margin_pct, margin_amount, line_total, currency_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (invoice_id, line_number) DO NOTHING`,
          [
            newInvId, lineNum++,
            str(item.item_desc, 500) ?? 'Item',
            'manual',
            qty, unitPrice, lineTotal, 0, 0, lineTotal,
            isUSD ? 'USD' : 'IQD',
          ]
        )
        invLineCount++
      }
    }
    console.log(`  → ${invLineCount} invoice lines`)

    // ── 5a. Migrate POs → purchase_orders ──────────────────
    console.log('[5/5] Migrating purchase orders …')
    const oldPoToNew: Record<string, string> = {}

    for (const po of poRows) {
      const poNum = str(po.po_number, 50)
      if (!poNum) continue

      const rawPoStatus = PO_STATUS[String(po.po_status ?? '1')] ?? 'opening'
      const status    = VALID_PO_STATUSES.has(rawPoStatus) ? rawPoStatus : 'opening'
      const openDate  = parseDate(po.open_date) ?? '2021-01-01'
      const deadline  = parseDate(po.po_deadline)
      const poRef     = str(po.po_ref_number, 100)

      const approvedAt  = toTs(po.approved_date)
      const submittedAt = po.submit_date
        ? toTs(String(po.submit_date).split('|')[0]!.trim())
        : null

      const r = await client.query<{ id: string }>(
        `INSERT INTO purchase_orders
           (company_id, po_number, vendor_id, status, currency_code, fx_rate,
            subtotal, tax_amount, total_amount, notes,
            expected_delivery_date, submitted_at, approved_at, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::timestamptz)
         ON CONFLICT (company_id, po_number) DO NOTHING
         RETURNING id`,
        [
          companyId, poNum, legacyVendorId, status, 'USD', 1,
          0, 0, 0,
          poRef ? `Legacy project ref: ${poRef}` : null,
          deadline,
          submittedAt,
          approvedAt,
          sysUserId,
          `${openDate}T00:00:00Z`,
        ]
      )
      if (r.rows[0]) oldPoToNew[String(po.po_id)] = r.rows[0].id
    }
    console.log(`  → ${Object.keys(oldPoToNew).length} purchase orders`)

    // ── 5b. Migrate po_items → po_lines ────────────────────
    let poLineCount = 0
    const linesByPo: Record<string, typeof poItemRows> = {}
    for (const item of poItemRows) {
      const k = String(item.po_id)
      if (!linesByPo[k]) linesByPo[k] = []
      linesByPo[k]!.push(item)
    }

    for (const [oldPoId, items] of Object.entries(linesByPo)) {
      const newPoId = oldPoToNew[oldPoId]
      if (!newPoId) continue

      let lineNum = 1
      for (const item of items) {
        const qty       = Math.abs(num(item.item_qty, 1)) || 1
        const unitPrice = Math.max(0, num(item.item_price_dollar) || num(item.item_store_price_dollar))

        await client.query(
          `INSERT INTO po_lines
             (po_id, line_number, description, qty_ordered, qty_received,
              unit_price, currency_code, uom, total_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (po_id, line_number) DO NOTHING`,
          [
            newPoId, lineNum++,
            str(item.item_desc, 500) ?? 'Item',
            qty, 0,
            unitPrice, 'USD',
            'unit',   // legacy Arabic units truncated — standardised to 'unit'
            unitPrice * qty,
          ]
        )
        poLineCount++
      }
    }
    console.log(`  → ${poLineCount} PO lines`)

    await client.query('COMMIT')

    console.log('\n✓ Migration complete')
    console.log(`  Projects:        ${Object.keys(codeToProjectId).length}`)
    console.log(`  Contracts:       ${Object.keys(projectIdToContractId).length}`)
    console.log(`  Invoices:        ${Object.keys(oldInvToNew).length}`)
    console.log(`  Invoice lines:   ${invLineCount}`)
    console.log(`  Purchase orders: ${Object.keys(oldPoToNew).length}`)
    console.log(`  PO lines:        ${poLineCount}`)

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\n✗ Migration FAILED — all changes rolled back')
    console.error(err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
