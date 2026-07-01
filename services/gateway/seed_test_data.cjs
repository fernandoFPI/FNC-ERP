const pg = require('c:\\Users\\PC\\OneDrive - Farage Printing Industries\\Desktop\\FNC ERP\\node_modules\\.pnpm\\pg@8.21.0\\node_modules\\pg')
const bcrypt = require('c:\\Users\\PC\\OneDrive - Farage Printing Industries\\Desktop\\FNC ERP\\node_modules\\.pnpm\\bcrypt@5.1.1\\node_modules\\bcrypt')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

const COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'

async function seed() {
  await client.connect()
  console.log('Connected. Seeding...')

  const pwHash = await bcrypt.hash('Test@1234', 10)

  // ── 1. Users (global — no company_id) ────────────────────────────────────
  const usersData = [
    { id: 'a1000000-0000-0000-0000-000000000001', email: 'pm@fnc.test' },
    { id: 'a1000000-0000-0000-0000-000000000002', email: 'procurement@fnc.test' },
    { id: 'a1000000-0000-0000-0000-000000000003', email: 'approver1@fnc.test' },
    { id: 'a1000000-0000-0000-0000-000000000004', email: 'approver2@fnc.test' },
    { id: 'a1000000-0000-0000-0000-000000000005', email: 'storekeeper@fnc.test' },
  ]
  for (const u of usersData) {
    await client.query(`
      INSERT INTO users (id, email, password_hash, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, true, NOW(), NOW())
      ON CONFLICT (email) DO NOTHING`,
      [u.id, u.email, pwHash])
  }
  // Fetch actual IDs
  const userRows = await client.query("SELECT id, email FROM users WHERE email LIKE '%@fnc.test' ORDER BY email")
  const userByEmail = {}
  for (const r of userRows.rows) userByEmail[r.email] = r.id
  console.log('Users:', Object.keys(userByEmail).join(', '))

  // ── 2. Employees (company-scoped) ─────────────────────────────────────────
  const empDefs = [
    { email: 'pm@fnc.test',          num: 'EMP-001', first: 'Ahmed',  last: 'Al-Rashid',    title: 'Project Manager' },
    { email: 'procurement@fnc.test', num: 'EMP-002', first: 'Sara',   last: 'Karimi',       title: 'Procurement Officer' },
    { email: 'approver1@fnc.test',   num: 'EMP-003', first: 'Khalid', last: 'Al-Mansouri',  title: 'Finance Manager' },
    { email: 'approver2@fnc.test',   num: 'EMP-004', first: 'Layla',  last: 'Hussain',      title: 'Operations Manager' },
    { email: 'storekeeper@fnc.test', num: 'EMP-005', first: 'Omar',   last: 'Farouk',       title: 'Store Keeper' },
  ]
  const empByEmail = {}
  for (const d of empDefs) {
    const uid = userByEmail[d.email]
    if (!uid) { console.warn('No user for', d.email); continue }
    const ex = await client.query("SELECT id FROM employees WHERE user_id = $1", [uid])
    if (ex.rows[0]) { empByEmail[d.email] = ex.rows[0].id; continue }
    const res = await client.query(`
      INSERT INTO employees (company_id, user_id, employee_number, first_name, last_name, job_title, hire_date, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'2023-01-01','active',NOW(),NOW()) RETURNING id`,
      [COMPANY_ID, uid, d.num, d.first, d.last, d.title])
    empByEmail[d.email] = res.rows[0].id
  }
  console.log('Employees:', Object.values(empByEmail).length)

  // ── 3. Vendors ────────────────────────────────────────────────────────────
  const vendors = [
    { id: 'b0000001-0000-0000-0000-000000000001', name: 'Al-Jazeera Construction Supplies', contact: 'Ali Hassan',    email: 'ali@aljazeera.iq',  phone: '+964-750-100-0001', cur: 'IQD' },
    { id: 'b0000001-0000-0000-0000-000000000002', name: 'Baghdad Steel & Metals Co.',       contact: 'Mohammed Talib', email: 'info@bsm.iq',       phone: '+964-750-200-0002', cur: 'IQD' },
    { id: 'b0000001-0000-0000-0000-000000000003', name: 'Erbil Electric Solutions',         contact: 'Soran Karim',   email: 'sales@ees.iq',      phone: '+964-750-300-0003', cur: 'IQD' },
    { id: 'b0000001-0000-0000-0000-000000000004', name: 'Kurdistan Cement Factory',         contact: 'Hasan Ibrahim', email: 'orders@kcf.iq',     phone: '+964-750-400-0004', cur: 'IQD' },
  ]
  for (const v of vendors) {
    await client.query(`
      INSERT INTO vendors (id, company_id, name, currency_code, contact_name, contact_email, contact_phone, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [v.id, COMPANY_ID, v.name, v.cur, v.contact, v.email, v.phone])
  }
  console.log('Vendors seeded:', vendors.length)

  // ── 4. Project stages ─────────────────────────────────────────────────────
  // Delete any orphaned stages from failed previous runs so we start clean
  const stageCheck = await client.query("SELECT COUNT(*) cnt FROM project_stages WHERE project_id = $1", [PROJECT_ID])
  if (parseInt(stageCheck.rows[0].cnt) > 0 && parseInt(stageCheck.rows[0].cnt) < 5) {
    await client.query("DELETE FROM project_stages WHERE project_id = $1", [PROJECT_ID])
    console.log('Cleared incomplete stages')
  }
  const stageCheck2 = await client.query("SELECT COUNT(*) cnt FROM project_stages WHERE project_id = $1", [PROJECT_ID])
  if (parseInt(stageCheck2.rows[0].cnt) === 0) {
    const stages = [
      { name: 'Site Preparation',   seq: 1, status: 'completed',   pct: 100, ps: '2024-01-15', pe: '2024-03-15', as_: '2024-01-20', ae: '2024-03-10', note: 'Completed on schedule.' },
      { name: 'Foundation Works',   seq: 2, status: 'completed',   pct: 100, ps: '2024-03-15', pe: '2024-06-30', as_: '2024-03-11', ae: '2024-06-28', note: 'Completed ahead of schedule.' },
      { name: 'Structural Frame',   seq: 3, status: 'active',      pct: 65,  ps: '2024-07-01', pe: '2024-12-31', as_: '2024-07-01', ae: null, note: 'Currently active.' },
      { name: 'MEP Rough-in',       seq: 4, status: 'pending',     pct: 0,   ps: '2025-01-01', pe: '2025-05-31', as_: null,         ae: null, note: null },
      { name: 'Interior Finishing', seq: 5, status: 'pending',     pct: 0,   ps: '2025-06-01', pe: '2025-11-30', as_: null,         ae: null, note: null },
    ]
    for (const s of stages) {
      await client.query(`
        INSERT INTO project_stages (project_id, name, sequence, status, completion_pct, planned_start_date, planned_end_date, actual_start_date, actual_end_date, notes, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
        [PROJECT_ID, s.name, s.seq, s.status, s.pct, s.ps, s.pe, s.as_, s.ae, s.note])
    }
    console.log('Stages seeded: 5')
  } else {
    console.log('Stages already exist:', stageCheck2.rows[0].cnt)
  }

  // ── 5. Project members ────────────────────────────────────────────────────
  const memberDefs = [
    { email: 'pm@fnc.test',          role: 'project_manager',   hours: 400 },
    { email: 'procurement@fnc.test', role: 'procurement_lead',  hours: 200 },
    { email: 'approver1@fnc.test',   role: 'team_member',       hours: 80  },
    { email: 'approver2@fnc.test',   role: 'team_member',       hours: 80  },
    { email: 'storekeeper@fnc.test', role: 'team_member',       hours: 120 },
  ]
  for (const m of memberDefs) {
    const eid = empByEmail[m.email]
    if (!eid) continue
    await client.query(`
      INSERT INTO project_members (project_id, employee_id, role, allocated_hours, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,true,NOW(),NOW())
      ON CONFLICT DO NOTHING`,
      [PROJECT_ID, eid, m.role, m.hours])
  }
  console.log('Members seeded')

  // ── 6. Update project ─────────────────────────────────────────────────────
  const pmEmpId = empByEmail['pm@fnc.test']
  await client.query(`
    UPDATE projects SET
      status = 'ongoing',
      project_manager_id = $2,
      planned_start_date = '2024-01-15',
      planned_end_date   = '2025-12-31',
      actual_start_date  = '2024-01-20',
      project_value      = 520000000,
      updated_at         = NOW()
    WHERE id = $1`,
    [PROJECT_ID, pmEmpId || null])
  console.log('Project set to ongoing')

  // ── 7. Purchase Orders ────────────────────────────────────────────────────
  const app1 = empByEmail['approver1@fnc.test']
  const app2 = empByEmail['approver2@fnc.test']
  const sk   = empByEmail['storekeeper@fnc.test']
  const procUid = userByEmail['procurement@fnc.test']

  const d = (daysAgo) => new Date(Date.now() - daysAgo * 86400000)
  const ds = (daysAgo) => d(daysAgo).toISOString()

  // Actual allowed statuses: opening, inventory_check, store_pricing, market_pricing,
  // price_verification, review, pending_approval, dept_assigned, approved, completed, deleted
  const pos = [
    { num:'PO-2024-0001', vid: vendors[3].id, st:'opening',           cur:'IQD', sub:18500000, tax:925000,  tot:19425000, note:'Cement & aggregate — foundation works',    asgn:app1, sub_at:null,   appr:null,  ord:null },
    { num:'PO-2024-0002', vid: vendors[0].id, st:'inventory_check',   cur:'IQD', sub:32000000, tax:1600000, tot:33600000, note:'Rebar steel for structural frame',          asgn:app1, sub_at:ds(18), appr:null,  ord:null },
    { num:'PO-2024-0003', vid: vendors[1].id, st:'store_pricing',     cur:'USD', sub:45000,    tax:2250,    tot:47250,    note:'Structural steel beams (import)',           asgn:app2, sub_at:ds(10), appr:null,  ord:null },
    { num:'PO-2024-0004', vid: vendors[2].id, st:'market_pricing',    cur:'IQD', sub:8750000,  tax:437500,  tot:9187500,  note:'Electrical conduit & wiring phase 1',      asgn:app2, sub_at:ds(25), appr:ds(20),ord:null },
    { num:'PO-2024-0005', vid: vendors[0].id, st:'price_verification',cur:'IQD', sub:56000000, tax:2800000, tot:58800000, note:'Formwork & scaffolding rental',            asgn:app1, sub_at:ds(35), appr:ds(28),ord:null },
    { num:'PO-2024-0006', vid: vendors[1].id, st:'review',            cur:'IQD', sub:24000000, tax:1200000, tot:25200000, note:'Ready-mix concrete — batch 1',             asgn:app1, sub_at:ds(40), appr:ds(35),ord:null },
    { num:'PO-2024-0007', vid: vendors[3].id, st:'pending_approval',  cur:'IQD', sub:12000000, tax:600000,  tot:12600000, note:'Insulation & waterproofing materials',     asgn:sk,   sub_at:ds(50), appr:ds(45),ord:null },
    { num:'PO-2024-0008', vid: vendors[0].id, st:'dept_assigned',     cur:'IQD', sub:9500000,  tax:475000,  tot:9975000,  note:'Site safety equipment & PPE',              asgn:sk,   sub_at:ds(60), appr:ds(55),ord:null },
    { num:'PO-2024-0009', vid: vendors[2].id, st:'approved',          cur:'IQD', sub:15000000, tax:750000,  tot:15750000, note:'Plumbing rough-in — levels 1-3',           asgn:app2, sub_at:ds(70), appr:ds(65),ord:null },
    { num:'PO-2024-0010', vid: vendors[1].id, st:'completed',         cur:'IQD', sub:7200000,  tax:360000,  tot:7560000,  note:'Demolition & earthworks equipment hire',   asgn:app1, sub_at:ds(90), appr:ds(85),ord:ds(80) },
  ]

  let poCreated = 0, poSkipped = 0
  for (const po of pos) {
    const ex = await client.query("SELECT id FROM purchase_orders WHERE po_number=$1 AND company_id=$2", [po.num, COMPANY_ID])
    if (ex.rows[0]) { poSkipped++; continue }
    await client.query(`
      INSERT INTO purchase_orders
        (company_id, po_number, vendor_id, status, currency_code, fx_rate,
         subtotal, tax_amount, total_amount, notes, project_id,
         assigned_approver_id, store_keeper_id, created_by,
         expected_delivery_date, submitted_at, approved_at, ordered_at,
         created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())`,
      [
        COMPANY_ID, po.num, po.vid, po.st, po.cur, po.cur === 'USD' ? 1310 : 1,
        po.sub, po.tax, po.tot, po.note, PROJECT_ID,
        po.asgn || null, sk || null, procUid || null,
        new Date(Date.now() + 30*86400000).toISOString().slice(0,10),
        po.sub_at, po.appr, po.ord
      ])
    poCreated++
  }
  console.log('POs created:', poCreated, '| skipped:', poSkipped)

  // ── 8. Products ───────────────────────────────────────────────────────────
  const productDefs = [
    { id: 'c0000001-0000-0000-0000-000000000001', sku: 'MAT-CEM-001', name: 'Portland Cement (50kg bag)',         cat: 'Materials',  uom: 'bag',   cost: 12500  },
    { id: 'c0000001-0000-0000-0000-000000000002', sku: 'MAT-RBR-016', name: 'Rebar Steel 16mm (ton)',             cat: 'Materials',  uom: 'ton',   cost: 1650000 },
    { id: 'c0000001-0000-0000-0000-000000000003', sku: 'MAT-RBR-012', name: 'Rebar Steel 12mm (ton)',             cat: 'Materials',  uom: 'ton',   cost: 1580000 },
    { id: 'c0000001-0000-0000-0000-000000000004', sku: 'MAT-STL-001', name: 'Structural Steel Beam HEA200 (ton)', cat: 'Materials',  uom: 'ton',   cost: 850    },
    { id: 'c0000001-0000-0000-0000-000000000005', sku: 'MAT-AGG-001', name: 'Crushed Aggregate 20mm (ton)',       cat: 'Materials',  uom: 'ton',   cost: 45000  },
    { id: 'c0000001-0000-0000-0000-000000000006', sku: 'ELE-CON-020', name: 'PVC Conduit 20mm (meter)',           cat: 'Electrical', uom: 'm',     cost: 2500   },
    { id: 'c0000001-0000-0000-0000-000000000007', sku: 'ELE-CAB-002', name: 'NYY Cable 2.5mm² (meter)',           cat: 'Electrical', uom: 'm',     cost: 3800   },
    { id: 'c0000001-0000-0000-0000-000000000008', sku: 'FRM-PNL-001', name: 'Plywood Formwork Panel 2.4×1.2m',   cat: 'Formwork',   uom: 'sheet', cost: 85000  },
    { id: 'c0000001-0000-0000-0000-000000000009', sku: 'FRM-SCF-001', name: 'Scaffolding Frame Set (set)',        cat: 'Formwork',   uom: 'set',   cost: 380000 },
    { id: 'c0000001-0000-0000-0000-000000000010', sku: 'CON-RMX-001', name: 'Ready-Mix Concrete C30 (m³)',        cat: 'Materials',  uom: 'm³',    cost: 180000 },
    { id: 'c0000001-0000-0000-0000-000000000011', sku: 'INS-BRD-050', name: 'XPS Insulation Board 50mm (m²)',     cat: 'Insulation', uom: 'm²',    cost: 25000  },
    { id: 'c0000001-0000-0000-0000-000000000012', sku: 'WTP-MBR-001', name: 'Waterproofing Membrane (roll)',      cat: 'Insulation', uom: 'roll',  cost: 45000  },
    { id: 'c0000001-0000-0000-0000-000000000013', sku: 'SAF-HLM-001', name: 'Safety Helmet (piece)',              cat: 'Safety',     uom: 'pcs',   cost: 15000  },
    { id: 'c0000001-0000-0000-0000-000000000014', sku: 'SAF-VST-001', name: 'Hi-Vis Safety Vest (piece)',         cat: 'Safety',     uom: 'pcs',   cost: 8500   },
    { id: 'c0000001-0000-0000-0000-000000000015', sku: 'SAF-BOT-001', name: 'Safety Boots (pair)',                cat: 'Safety',     uom: 'pair',  cost: 55000  },
    { id: 'c0000001-0000-0000-0000-000000000016', sku: 'PLM-PVC-110', name: 'PVC Pipe 110mm (meter)',             cat: 'Plumbing',   uom: 'm',     cost: 8500   },
    { id: 'c0000001-0000-0000-0000-000000000017', sku: 'PLM-FIT-001', name: 'PVC Fittings Assorted (lot)',        cat: 'Plumbing',   uom: 'lot',   cost: 250000 },
    { id: 'c0000001-0000-0000-0000-000000000018', sku: 'EQP-EXC-001', name: 'Excavator Hire (day)',               cat: 'Equipment',  uom: 'day',   cost: 450000 },
    { id: 'c0000001-0000-0000-0000-000000000019', sku: 'EQP-DMP-001', name: 'Dump Truck Hire (day)',              cat: 'Equipment',  uom: 'day',   cost: 180000 },
  ]
  for (const p of productDefs) {
    await client.query(`
      INSERT INTO products (id, company_id, sku, name, category, uom, standard_cost, average_cost, is_storable, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7,true,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [p.id, COMPANY_ID, p.sku, p.name, p.cat, p.uom, p.cost])
  }
  console.log('Products seeded:', productDefs.length)

  // ── 9. PO Lines ───────────────────────────────────────────────────────────
  const poRows = await client.query(
    "SELECT id, po_number, currency_code FROM purchase_orders WHERE project_id=$1",
    [PROJECT_ID]
  )
  const poById = {}
  for (const r of poRows.rows) poById[r.po_number] = { id: r.id, cur: r.currency_code }

  const P = (sku) => productDefs.find(p => p.sku === sku)

  // lines: [po_number, line_number, product_sku, description, qty, unit_price, uom, qty_received]
  const linesDef = [
    // PO-2024-0001  Cement & aggregate, IQD 18,500,000
    ['PO-2024-0001', 1, 'MAT-CEM-001', 'Portland Cement 50kg bags',     800,  12500,  'bag', 0],
    ['PO-2024-0001', 2, 'MAT-AGG-001', 'Crushed Aggregate 20mm',        200,  45000,  'ton', 0],
    // PO-2024-0002  Rebar, IQD 32,000,000
    ['PO-2024-0002', 1, 'MAT-RBR-016', 'Rebar 16mm — structural frame', 12,   1650000,'ton', 0],
    ['PO-2024-0002', 2, 'MAT-RBR-012', 'Rebar 12mm — ties & stirrups',  5,    1580000,'ton', 0],
    // PO-2024-0003  Structural steel, USD 45,000
    ['PO-2024-0003', 1, 'MAT-STL-001', 'HEA200 Steel Beams',            40,   850,    'ton', 0],
    ['PO-2024-0003', 2, 'MAT-STL-001', 'Welding & connection materials', 4,    850,    'ton', 0],
    // PO-2024-0004  Electrical conduit, IQD 8,750,000
    ['PO-2024-0004', 1, 'ELE-CON-020', 'PVC Conduit 20mm',              1500, 2500,   'm',   0],
    ['PO-2024-0004', 2, 'ELE-CAB-002', 'NYY Cable 2.5mm²',              800,  3800,   'm',   0],
    // PO-2024-0005  Formwork & scaffolding, IQD 56,000,000
    ['PO-2024-0005', 1, 'FRM-PNL-001', 'Plywood Formwork Panels',       400,  85000,  'sheet',0],
    ['PO-2024-0005', 2, 'FRM-SCF-001', 'Scaffolding Frame Sets',        80,   380000, 'set', 0],
    // PO-2024-0006  Ready-mix concrete, IQD 24,000,000
    ['PO-2024-0006', 1, 'CON-RMX-001', 'Ready-Mix Concrete C30',        100,  180000, 'm³',  0],
    ['PO-2024-0006', 2, 'CON-RMX-001', 'Ready-Mix Concrete C25 (slabs)', 33,  180000, 'm³',  0],
    // PO-2024-0007  Insulation & waterproofing, IQD 12,000,000
    ['PO-2024-0007', 1, 'INS-BRD-050', 'XPS Insulation Board 50mm',    260,  25000,  'm²',  0],
    ['PO-2024-0007', 2, 'WTP-MBR-001', 'Waterproofing Membrane rolls', 100,  45000,  'roll', 0],
    // PO-2024-0008  Safety equipment, IQD 9,500,000
    ['PO-2024-0008', 1, 'SAF-HLM-001', 'Safety Helmets',               200,  15000,  'pcs', 0],
    ['PO-2024-0008', 2, 'SAF-VST-001', 'Hi-Vis Safety Vests',          200,  8500,   'pcs', 0],
    ['PO-2024-0008', 3, 'SAF-BOT-001', 'Safety Boots',                  80,  55000,  'pair', 0],
    // PO-2024-0009  Plumbing, IQD 15,000,000
    ['PO-2024-0009', 1, 'PLM-PVC-110', 'PVC Pipe 110mm — drainage',    600,  8500,   'm',   0],
    ['PO-2024-0009', 2, 'PLM-FIT-001', 'Fittings Assorted Lots',        30,  250000, 'lot', 0],
    // PO-2024-0010  Equipment hire (completed), IQD 7,200,000
    ['PO-2024-0010', 1, 'EQP-EXC-001', 'Excavator Hire',               10,   450000, 'day', 10],
    ['PO-2024-0010', 2, 'EQP-DMP-001', 'Dump Truck Hire',              10,   180000, 'day', 10],
  ]

  let linesCreated = 0
  for (const [poNum, lineNo, sku, desc, qty, unitPrice, uom, qtyRcv] of linesDef) {
    const po = poById[poNum]
    if (!po) { console.warn('PO not found for lines:', poNum); continue }
    const prod = P(sku)
    // check if line already exists
    const ex = await client.query(
      "SELECT id FROM po_lines WHERE po_id=$1 AND line_number=$2",
      [po.id, lineNo]
    )
    if (ex.rows[0]) continue
    await client.query(`
      INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, qty_received, unit_price, currency_code, uom, total_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [po.id, lineNo, desc, prod ? prod.id : null, qty, qtyRcv, unitPrice, po.cur, uom, qty * unitPrice])
    linesCreated++
  }
  console.log('PO lines created:', linesCreated)

  // ── 10. Summary ───────────────────────────────────────────────────────────
  const s = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE email LIKE '%@fnc.test') AS users,
      (SELECT COUNT(*) FROM employees WHERE company_id=$1) AS employees,
      (SELECT COUNT(*) FROM vendors WHERE company_id=$1) AS vendors,
      (SELECT COUNT(*) FROM products WHERE company_id=$1) AS products,
      (SELECT COUNT(*) FROM purchase_orders WHERE project_id=$2) AS pos,
      (SELECT COUNT(*) FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id=$2)) AS po_lines,
      (SELECT COUNT(*) FROM project_stages WHERE project_id=$2) AS stages,
      (SELECT COUNT(*) FROM project_members WHERE project_id=$2) AS members,
      (SELECT status FROM projects WHERE id=$2) AS project_status`,
    [COMPANY_ID, PROJECT_ID])
  console.log('\n=== SEED COMPLETE ===')
  console.log(JSON.stringify(s.rows[0], null, 2))
  console.log('\nTest credentials: pm@fnc.test / Test@1234')

  await client.end()
}

seed().catch(function(e){ console.error('FATAL:', e.message, '\nDetail:', e.detail || ''); process.exit(1) })
