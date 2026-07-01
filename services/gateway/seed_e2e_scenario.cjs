/**
 * SEED: End-to-End Scenario — Al-Mansour Residential Complex Block C
 * ═══════════════════════════════════════════════════════════════════
 * Scenario:
 *   Nishtimani Yakam Co wins a contract to build residential Block C.
 *   They commission Nishtimani Factory to manufacture 40 prefab concrete
 *   wall panels (3m × 6m). The factory procures raw materials through the
 *   full PO lifecycle, manufactures the panels, and invoices Yakam via an
 *   intercompany goods transfer. Yakam also rents the factory's tower crane
 *   for installation. Both companies record full journal entries and analytic
 *   account allocations.
 *
 * Run: DATABASE_URL=... node seed_e2e_scenario.cjs
 */

'use strict'
const pg = require('c:\\Users\\PC\\OneDrive - Farage Printing Industries\\Desktop\\FNC ERP\\node_modules\\.pnpm\\pg@8.21.0\\node_modules\\pg')
const bcrypt = require('c:\\Users\\PC\\OneDrive - Farage Printing Industries\\Desktop\\FNC ERP\\node_modules\\.pnpm\\bcrypt@5.1.1\\node_modules\\bcrypt')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

// ─── Stable IDs ────────────────────────────────────────────────────────────
const YAKAM_ID    = '00000000-0000-0000-0000-000000000001'  // existing Yakam co
const FACTORY_ID  = '00000000-0000-0000-0000-000000000002'  // Nishtimani Factory

const PROJECT_OLD = '30000000-0000-0000-0000-000000000001'  // existing seed project
const PROJECT_C   = '30000000-0000-0000-0000-000000000099'  // Block C (Yakam)

// Factory users
const FU = {
  admin:  'a2000000-0000-0000-0000-000000000001',
  pm:     'a2000000-0000-0000-0000-000000000002',
  sk:     'a2000000-0000-0000-0000-000000000003',  // store keeper
  sp:     'a2000000-0000-0000-0000-000000000004',  // store pricing
  po:     'a2000000-0000-0000-0000-000000000005',  // procurement officer
  p2:     'a2000000-0000-0000-0000-000000000006',  // procurement 2nd
  fm:     'a2000000-0000-0000-0000-000000000007',  // finance / dept-head approver
}

// Analytic accounts
const AA = {
  yakam_blockc:    'aa000001-0000-0000-0000-000000000001',
  yakam_overhead:  'aa000001-0000-0000-0000-000000000002',
  factory_prefab:  'aa000001-0000-0000-0000-000000000003',
  factory_rental:  'aa000001-0000-0000-0000-000000000004',
}

// Chart of Accounts — Yakam
const COA_Y = {
  cash:          'ca000001-0000-0000-0000-000000000001',
  ar:            'ca000001-0000-0000-0000-000000000002',
  inventory:     'ca000001-0000-0000-0000-000000000003',
  wip:           'ca000001-0000-0000-0000-000000000004',
  interco_pay:   'ca000001-0000-0000-0000-000000000005',
  ap:            'ca000001-0000-0000-0000-000000000006',
  revenue:       'ca000001-0000-0000-0000-000000000007',
  cogs:          'ca000001-0000-0000-0000-000000000008',
  rental_exp:    'ca000001-0000-0000-0000-000000000009',
  opex:          'ca000001-0000-0000-0000-000000000010',
}

// Chart of Accounts — Factory
const COA_F = {
  cash:          'ca000002-0000-0000-0000-000000000001',
  interco_rec:   'ca000002-0000-0000-0000-000000000002',
  raw_inv:       'ca000002-0000-0000-0000-000000000003',
  finished_inv:  'ca000002-0000-0000-0000-000000000004',
  wip:           'ca000002-0000-0000-0000-000000000005',
  ap:            'ca000002-0000-0000-0000-000000000006',
  mfg_revenue:   'ca000002-0000-0000-0000-000000000007',
  rental_rev:    'ca000002-0000-0000-0000-000000000008',
  raw_mat_cost:  'ca000002-0000-0000-0000-000000000009',
  labor_cost:    'ca000002-0000-0000-0000-000000000010',
}

// Products (factory scope)
const FP = {
  cement:   'fc000001-0000-0000-0000-000000000001',
  rebar12:  'fc000001-0000-0000-0000-000000000002',
  mesh:     'fc000001-0000-0000-0000-000000000003',
  release:  'fc000001-0000-0000-0000-000000000004',
  panel:    'fc000001-0000-0000-0000-000000000005',  // finished product
  crane:    'fc000001-0000-0000-0000-000000000006',  // crane hire service
}

const BOM_ID     = 'b0000001-0000-0000-0000-000000000001'
const WC_ID      = '0c000001-0000-0000-0000-000000000001'
const MO_ID      = 'a0b00001-0000-0000-0000-000000000001'
const CRANE_ID   = 'e0000001-0000-0000-0000-000000000001'
const RC_ID      = 'ac000001-0000-0000-0000-000000000001'
const IT_ID      = '17000001-0000-0000-0000-000000000001'
const PO_RM_ID   = 'a9999001-0000-0000-0000-000000000001'

// Vendors (factory-scope)
const VENDOR_CEMENT = 'b0000002-0000-0000-0000-000000000001'
const VENDOR_STEEL  = 'b0000002-0000-0000-0000-000000000002'
const VENDOR_CHEM   = 'b0000002-0000-0000-0000-000000000003'

// Journal Entries
const JE = {
  f_raw_purchase:   '0e000001-0000-0000-0000-000000000001',
  f_mfg_cost:       '0e000001-0000-0000-0000-000000000002',
  f_interco_rev:    '0e000001-0000-0000-0000-000000000003',
  f_rental_rev:     '0e000001-0000-0000-0000-000000000004',
  y_interco_rcv:    '0e000002-0000-0000-0000-000000000001',
  y_rental_exp:     '0e000002-0000-0000-0000-000000000002',
  y_po_expense:     '0e000002-0000-0000-0000-000000000003',
}

// Stock locations
const SL_FACTORY_WH   = '51000001-0000-0000-0000-000000000001'
const SL_FACTORY_PROD = '51000001-0000-0000-0000-000000000002'
const SL_YAKAM_SITE   = '51000002-0000-0000-0000-000000000001'

async function seed() {
  await client.connect()
  console.log('✓ Connected to database\n')

  const pwHash = await bcrypt.hash('Test@1234', 10)

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 1 — NISHTIMANI FACTORY COMPANY
  // ════════════════════════════════════════════════════════════════════════
  console.log('── Section 1: Nishtimani Factory company ──')
  await client.query(`
    INSERT INTO companies (id, name, legal_name, country_code, address,
      currency_code, interco_transfer_pricing_method, interco_cost_plus_markup_pct,
      is_active, setup_completed, created_at, updated_at)
    VALUES ($1,'Nishtimani Factory','Nishtimani Precast & Manufacturing Co. LLC',
      'IQ','Industrial Zone, Erbil, Iraq',
      'IQD','cost_plus',0.25,true,true,NOW(),NOW())
    ON CONFLICT (id) DO NOTHING`,
    [FACTORY_ID])

  await client.query(`
    INSERT INTO system_configuration (company_id) VALUES ($1)
    ON CONFLICT DO NOTHING`, [FACTORY_ID])

  console.log('  ✓ Factory company created')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 2 — FACTORY USERS, EMPLOYEES & ROLES
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 2: Factory users & employees ──')

  const factoryUsers = [
    { id: FU.admin, email: 'factory.admin@fnc.test',  role: 'system_admin' },
    { id: FU.pm,    email: 'factory.pm@fnc.test',     role: 'module_admin' },
    { id: FU.sk,    email: 'factory.sk@fnc.test',     role: 'user' },
    { id: FU.sp,    email: 'factory.sp@fnc.test',     role: 'user' },
    { id: FU.po,    email: 'factory.po@fnc.test',     role: 'user' },
    { id: FU.p2,    email: 'factory.p2@fnc.test',     role: 'user' },
    { id: FU.fm,    email: 'factory.fm@fnc.test',     role: 'module_admin' },
  ]

  for (const u of factoryUsers) {
    await client.query(`
      INSERT INTO users (id, email, password_hash, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,true,NOW(),NOW()) ON CONFLICT (email) DO NOTHING`,
      [u.id, u.email, pwHash])
    await client.query(`
      INSERT INTO user_company_roles (user_id, company_id, role, module, is_active)
      VALUES ($1,$2,$3,'procurement',true) ON CONFLICT DO NOTHING`,
      [u.id, FACTORY_ID, u.role])
  }

  const factoryEmps = [
    { uid: FU.admin, num: 'FNF-001', first: 'Zaid',    last: 'Al-Khalidi',  title: 'General Manager',         dept: null },
    { uid: FU.pm,    num: 'FNF-002', first: 'Dilan',   last: 'Mustafa',     title: 'Production Manager',      dept: null },
    { uid: FU.sk,    num: 'FNF-003', first: 'Hasan',   last: 'Zebari',      title: 'Store Keeper',            dept: null },
    { uid: FU.sp,    num: 'FNF-004', first: 'Saman',   last: 'Barzani',     title: 'Pricing Analyst',         dept: null },
    { uid: FU.po,    num: 'FNF-005', first: 'Aram',    last: 'Hawrami',     title: 'Procurement Officer',     dept: null },
    { uid: FU.p2,    num: 'FNF-006', first: 'Nadia',   last: 'Saleh',       title: 'Senior Procurement',      dept: null },
    { uid: FU.fm,    num: 'FNF-007', first: 'Karwan',  last: 'Rashid',      title: 'Finance Manager',         dept: null },
  ]

  const fEmpById = {}
  for (const e of factoryEmps) {
    const ex = await client.query(
      'SELECT id FROM employees WHERE user_id=$1 AND company_id=$2', [e.uid, FACTORY_ID])
    if (ex.rows[0]) { fEmpById[e.uid] = ex.rows[0].id; continue }
    const r = await client.query(`
      INSERT INTO employees
        (company_id, user_id, employee_number, first_name, last_name, job_title,
         employment_type, hire_date, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'full_time','2022-03-01','active',NOW(),NOW())
      RETURNING id`,
      [FACTORY_ID, e.uid, e.num, e.first, e.last, e.title])
    fEmpById[e.uid] = r.rows[0].id
  }
  console.log('  ✓ Factory users:', factoryUsers.length, '| employees:', Object.keys(fEmpById).length)

  // Department — Precast Division (for dept-head approval flow)
  const deptR = await client.query(`
    INSERT INTO departments (company_id, name, manager_id, is_active, created_at, updated_at)
    VALUES ($1,'Precast & Manufacturing Division',$2,true,NOW(),NOW())
    ON CONFLICT DO NOTHING RETURNING id`,
    [FACTORY_ID, fEmpById[FU.fm]])
  let deptId
  if (!deptR.rows[0]) {
    const d = await client.query(
      "SELECT id FROM departments WHERE company_id=$1 AND name='Precast & Manufacturing Division'", [FACTORY_ID])
    deptId = d.rows[0]?.id
  } else { deptId = deptR.rows[0].id }

  // Assign FM employee to precast department
  if (deptId) {
    await client.query(
      'UPDATE employees SET department_id=$1 WHERE id=$2',
      [deptId, fEmpById[FU.fm]])
    // Also put the PO organizer (PM) in the same department
    await client.query(
      'UPDATE employees SET department_id=$1 WHERE id=$2',
      [deptId, fEmpById[FU.pm]])
  }
  console.log('  ✓ Precast Division department created, manager: Karwan Rashid (FM)')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 3 — ANALYTIC ACCOUNTS (both companies)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 3: Analytic accounts ──')

  const analyticAccounts = [
    { id: AA.yakam_blockc,   cid: YAKAM_ID,   code: 'YAKAM-2024-BLKC', name: 'Al-Mansour Block C — Construction' },
    { id: AA.yakam_overhead, cid: YAKAM_ID,   code: 'YAKAM-2024-OVHD', name: 'Yakam — Corporate Overhead 2024' },
    { id: AA.factory_prefab, cid: FACTORY_ID, code: 'FNF-2024-PREFAB',  name: 'Prefab Panels — Block C Job' },
    { id: AA.factory_rental, cid: FACTORY_ID, code: 'FNF-2024-RENTAL',  name: 'Equipment Rental Income 2024' },
  ]
  for (const a of analyticAccounts) {
    await client.query(`
      INSERT INTO analytic_accounts (id, company_id, code, name, is_active, created_at)
      VALUES ($1,$2,$3,$4,true,NOW()) ON CONFLICT (company_id, code) DO NOTHING`,
      [a.id, a.cid, a.code, a.name])
  }
  console.log('  ✓ Analytic accounts:', analyticAccounts.length)

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 4 — CHART OF ACCOUNTS (both companies)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 4: Chart of accounts ──')

  const coaYakam = [
    { id: COA_Y.cash,        code: '1100', name: 'Cash & Bank',                    type: 'asset' },
    { id: COA_Y.ar,          code: '1200', name: 'Accounts Receivable',            type: 'asset' },
    { id: COA_Y.inventory,   code: '1300', name: 'Material Inventory',             type: 'asset' },
    { id: COA_Y.wip,         code: '1400', name: 'Work in Progress — Construction',type: 'asset' },
    { id: COA_Y.interco_pay, code: '2150', name: 'Intercompany Payable',           type: 'liability' },
    { id: COA_Y.ap,          code: '2100', name: 'Accounts Payable',               type: 'liability' },
    { id: COA_Y.revenue,     code: '4000', name: 'Contract Revenue',               type: 'revenue' },
    { id: COA_Y.cogs,        code: '5000', name: 'Cost of Goods Sold / Project Cost', type: 'expense' },
    { id: COA_Y.rental_exp,  code: '6100', name: 'Equipment Rental Expense',       type: 'expense' },
    { id: COA_Y.opex,        code: '6000', name: 'General & Administrative Expense',type: 'expense' },
  ]
  const coaFactory = [
    { id: COA_F.cash,        code: '1100', name: 'Cash & Bank',                    type: 'asset' },
    { id: COA_F.interco_rec, code: '1210', name: 'Intercompany Receivable',        type: 'asset' },
    { id: COA_F.raw_inv,     code: '1310', name: 'Raw Material Inventory',         type: 'asset' },
    { id: COA_F.finished_inv,code: '1320', name: 'Finished Goods Inventory',       type: 'asset' },
    { id: COA_F.wip,         code: '1400', name: 'Work in Progress — Manufacturing',type: 'asset' },
    { id: COA_F.ap,          code: '2100', name: 'Accounts Payable',               type: 'liability' },
    { id: COA_F.mfg_revenue, code: '4000', name: 'Manufacturing / Interco Revenue',type: 'revenue' },
    { id: COA_F.rental_rev,  code: '4100', name: 'Equipment Rental Revenue',       type: 'revenue' },
    { id: COA_F.raw_mat_cost,code: '5000', name: 'Raw Material Cost',              type: 'expense' },
    { id: COA_F.labor_cost,  code: '5100', name: 'Manufacturing Labor & Overhead', type: 'expense' },
  ]

  for (const acc of [...coaYakam.map(a => ({ ...a, cid: YAKAM_ID })),
                     ...coaFactory.map(a => ({ ...a, cid: FACTORY_ID }))]) {
    await client.query(`
      INSERT INTO chart_of_accounts
        (id, company_id, code, name, account_type, currency_code, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'IQD',true,NOW(),NOW())
      ON CONFLICT (company_id, code) DO NOTHING`,
      [acc.id, acc.cid, acc.code, acc.name, acc.type])
  }
  console.log('  ✓ CoA entries:', coaYakam.length + coaFactory.length, '(', coaYakam.length, 'Yakam +', coaFactory.length, 'Factory)')

  // ── Resolve actual CoA IDs (handles conflict with pre-existing accounts) ──
  const _coaRows = await client.query(`
    SELECT DISTINCT ON (company_id, code) id, company_id, code
    FROM chart_of_accounts WHERE company_id IN ($1,$2)
    ORDER BY company_id, code, id`, [YAKAM_ID, FACTORY_ID])
  const _coaMap = {}
  for (const r of _coaRows.rows) _coaMap[r.company_id + ':' + r.code] = r.id
  const coa = (cid, code) => {
    const id = _coaMap[cid + ':' + code]
    if (!id) console.warn('    WARN: No CoA found for', cid.slice(-8), code)
    return id || null
  }
  // Map for rental revenue — use code 4300 if 4100 was taken by pre-existing entry
  const factoryRentalRevCode = _coaMap[FACTORY_ID + ':4100'] ? '4100' : '4300'

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 5 — STOCK LOCATIONS
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 5: Stock locations ──')

  const stockLocs = [
    { id: SL_FACTORY_WH,   cid: FACTORY_ID, code: 'FNF-WH-01',   name: 'Factory Main Warehouse',        type: 'warehouse' },
    { id: SL_FACTORY_PROD, cid: FACTORY_ID, code: 'FNF-PROD-01',  name: 'Precast Production Floor',      type: 'site' },
    { id: SL_YAKAM_SITE,   cid: YAKAM_ID,   code: 'YAK-SITE-BLKC',name: 'Al-Mansour Block C Site',       type: 'site' },
  ]
  for (const sl of stockLocs) {
    await client.query(`
      INSERT INTO stock_locations (id, company_id, name, code, type, is_active, created_at)
      VALUES ($1,$2,$3,$4,$5,true,NOW()) ON CONFLICT (company_id, code) DO NOTHING`,
      [sl.id, sl.cid, sl.name, sl.code, sl.type])
  }
  console.log('  ✓ Stock locations:', stockLocs.length)

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 6 — YAKAM BLOCK C PROJECT
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 6: Block C project (Yakam) ──')

  // Get Yakam PM employee + user
  const yakamPM = await client.query(
    "SELECT e.id AS eid, u.id AS uid FROM employees e JOIN users u ON u.id=e.user_id WHERE u.email='pm@fnc.test' AND e.company_id=$1 LIMIT 1",
    [YAKAM_ID])
  const yakamPMEmpId = yakamPM.rows[0]?.eid
  const yakamPMUserId = yakamPM.rows[0]?.uid

  // Get analytic_account id for Block C (may exist or not)
  const aaBlockC = AA.yakam_blockc

  await client.query(`
    INSERT INTO projects
      (id, company_id, code, name, project_type, status, project_manager_id,
       planned_start_date, planned_end_date, actual_start_date,
       project_value, project_value_currency,
       budget_amount, budget_currency,
       analytic_account_id,
       remarks, created_by, created_at, updated_at)
    VALUES
      ($1,$2,'YAKAM-2025-BLKC','Al-Mansour Residential Complex — Block C',
       'construction','ongoing',$3,
       '2025-03-01','2026-06-30','2025-03-15',
       850000000,'IQD', 720000000,'IQD',
       $4,
       'Prefab concrete wall system. 40 panels sourced from Nishtimani Factory.',
       $5, NOW(),NOW())
    ON CONFLICT (id) DO NOTHING`,
    [PROJECT_C, YAKAM_ID, yakamPMEmpId || null, aaBlockC,
     yakamPMUserId || null])

  // Project stages (7 stages — detailed real-world breakdown)
  const blockCStages = [
    { name: 'Mobilisation & Site Setup',   seq: 1, status: 'completed', pct: 100, ps: '2025-03-01', pe: '2025-03-31', as_: '2025-03-15', ae: '2025-03-28', note: 'Site office, fencing, access roads. Completed on time.' },
    { name: 'Substructure & Foundation',   seq: 2, status: 'completed', pct: 100, ps: '2025-04-01', pe: '2025-05-31', as_: '2025-04-02', ae: '2025-05-29', note: 'Pad footings + ground beams. 2 days ahead of schedule.' },
    { name: 'Structural Frame — Level 1',  seq: 3, status: 'completed', pct: 100, ps: '2025-06-01', pe: '2025-07-15', as_: '2025-06-03', ae: '2025-07-12', note: 'Columns, beams, prefab wall panels. Crane hired from Factory.' },
    { name: 'Structural Frame — Level 2-4',seq: 4, status: 'active',    pct: 45,  ps: '2025-07-16', pe: '2025-09-30', as_: '2025-07-16', ae: null,         note: '45% complete. Prefab panels being installed floor by floor.' },
    { name: 'MEP First Fix',               seq: 5, status: 'pending',   pct: 0,   ps: '2025-10-01', pe: '2025-11-30', as_: null,         ae: null,         note: null },
    { name: 'Internal Finishes',           seq: 6, status: 'pending',   pct: 0,   ps: '2025-12-01', pe: '2026-03-31', as_: null,         ae: null,         note: null },
    { name: 'Handover & Commissioning',    seq: 7, status: 'pending',   pct: 0,   ps: '2026-04-01', pe: '2026-06-30', as_: null,         ae: null,         note: null },
  ]

  const existingStages = await client.query(
    'SELECT COUNT(*) c FROM project_stages WHERE project_id=$1', [PROJECT_C])
  if (parseInt(existingStages.rows[0].c) === 0) {
    for (const s of blockCStages) {
      await client.query(`
        INSERT INTO project_stages
          (project_id, name, sequence, status, completion_pct, completion_percentage,
           planned_start_date, planned_end_date, actual_start_date, actual_end_date,
           notes, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
        [PROJECT_C, s.name, s.seq, s.status, s.pct, s.pct, s.ps, s.pe, s.as_, s.ae, s.note])
    }
    console.log('  ✓ Block C stages:', blockCStages.length)
  } else {
    console.log('  ✓ Block C stages already seeded')
  }

  // Project members (Yakam team)
  const yakamUsers = await client.query(
    "SELECT u.id uid, e.id eid FROM users u JOIN employees e ON e.user_id=u.id WHERE u.email LIKE '%@fnc.test' AND e.company_id=$1",
    [YAKAM_ID])
  for (const r of yakamUsers.rows) {
    await client.query(`
      INSERT INTO project_members (project_id, employee_id, role, allocated_hours, is_active, created_at, updated_at)
      VALUES ($1,$2,'team_member',200,true,NOW(),NOW()) ON CONFLICT DO NOTHING`,
      [PROJECT_C, r.eid])
  }
  // PM gets project_manager role
  if (yakamPMEmpId) {
    await client.query(`
      UPDATE project_members SET role='project_manager' WHERE project_id=$1 AND employee_id=$2`,
      [PROJECT_C, yakamPMEmpId])
  }
  console.log('  ✓ Block C project live — 7 stages, team assigned, analytic account linked')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 7 — FACTORY VENDORS & PRODUCTS
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 7: Factory vendors & products ──')

  const factoryVendors = [
    { id: VENDOR_CEMENT, name: 'Kurdistan Cement Factory',    cur: 'IQD', contact: 'Hasan Ibrahim', email: 'orders@kcf.iq',       phone: '+964-750-400-0004' },
    { id: VENDOR_STEEL,  name: 'Baghdad Steel & Metals Co.',  cur: 'IQD', contact: 'Mohammed Talib',email: 'info@bsm.iq',          phone: '+964-750-200-0002' },
    { id: VENDOR_CHEM,   name: 'Tigris Chemical Supplies',    cur: 'IQD', contact: 'Lara Majid',    email: 'lara@tigrischem.iq',   phone: '+964-750-550-0003' },
  ]
  for (const v of factoryVendors) {
    await client.query(`
      INSERT INTO vendors
        (id, company_id, name, currency_code, contact_name, contact_email, contact_phone, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [v.id, FACTORY_ID, v.name, v.cur, v.contact, v.email, v.phone])
  }

  const factoryProducts = [
    { id: FP.cement,  sku: 'FNF-CEM-001', name: 'Portland Cement 52.5N (50kg bag)', cat: 'Raw Materials',   uom: 'bag',   cost: 13000 },
    { id: FP.rebar12, sku: 'FNF-RBR-012', name: 'Rebar Steel 12mm Grade 60 (ton)', cat: 'Raw Materials',   uom: 'ton',   cost: 1620000 },
    { id: FP.mesh,    sku: 'FNF-MSH-001', name: 'Welded Steel Mesh 6×2.4m (sheet)',cat: 'Raw Materials',   uom: 'sheet', cost: 48000 },
    { id: FP.release, sku: 'FNF-REL-001', name: 'Formwork Release Agent (200L drum)',cat:'Chemicals',      uom: 'drum',  cost: 320000 },
    { id: FP.panel,   sku: 'FNF-PNL-3X6', name: 'Prefab Concrete Wall Panel 3m×6m',cat: 'Finished Goods', uom: 'panel', cost: 0 },  // cost set at completion
    { id: FP.crane,   sku: 'FNF-EQP-CRN', name: 'Tower Crane Liebherr 280 EC-H (hire)', cat: 'Equipment', uom: 'month', cost: 3500000 },
  ]
  for (const p of factoryProducts) {
    await client.query(`
      INSERT INTO products
        (id, company_id, sku, name, category, uom, standard_cost, average_cost, is_storable, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7,true,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [p.id, FACTORY_ID, p.sku, p.name, p.cat, p.uom, p.cost])
  }
  console.log('  ✓ Factory vendors: 3 | products: 6')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 8 — PO POSITION ASSIGNMENTS (Factory)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 8: PO position assignments (Factory) ──')

  const positions = [
    { uid: FU.sk, position: 'store_keeper' },
    { uid: FU.sp, position: 'store_pricing' },
    { uid: FU.po, position: 'procurement_officer' },
    { uid: FU.p2, position: 'procurement_2nd' },
  ]
  for (const p of positions) {
    const empId = fEmpById[p.uid]
    if (!empId) continue
    // Need either project_id or department_id; use deptId
    const scopeId = deptId || null
    if (!scopeId) { console.warn('    No dept for position assignment, skipping'); continue }
    await client.query(`
      INSERT INTO po_position_assignments
        (company_id, employee_id, position, department_id, assigned_by, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())
      ON CONFLICT DO NOTHING`,
      [FACTORY_ID, empId, p.position, scopeId, FU.admin])
  }
  console.log('  ✓ Positions assigned: store_keeper, store_pricing, procurement_officer, procurement_2nd')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 9 — FACTORY RAW MATERIALS PO (Full A→Z Lifecycle)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 9: Factory Raw Materials PO — Full lifecycle ──')

  const poEx = await client.query('SELECT id FROM purchase_orders WHERE id=$1', [PO_RM_ID])
  if (poEx.rows[0]) {
    console.log('  ✓ PO already exists, skipping')
  } else {
    // Create PO as completed (lifecycle fully walked through below via log)
    await client.query(`
      INSERT INTO purchase_orders
        (id, company_id, po_number, vendor_id, status, currency_code, fx_rate,
         subtotal, tax_amount, total_amount, notes, project_id,
         organizer_id, assigned_approver_id, store_keeper_id,
         store_pricing_id, procurement_officer_id, procurement_2nd_id,
         expected_delivery_date, created_by, created_at, updated_at)
      VALUES
        ($1,$2,'PO-FNF-2025-001',$3,'completed','IQD',1,
         32140000,1607000,33747000,
         'Raw materials for manufacturing 40 Prefab Concrete Wall Panels (3m×6m) — Al-Mansour Block C project for Nishtimani Yakam Co.',
         NULL,
         $4,$5,$6,$7,$8,$9,
         '2025-05-20',$10,
         NOW() - INTERVAL '45 days',
         NOW() - INTERVAL '5 days')`,
      [
        PO_RM_ID, FACTORY_ID, VENDOR_CEMENT,
        FU.pm,                   // organizer
        fEmpById[FU.fm],         // assigned_approver (dept head)
        fEmpById[FU.sk],         // store_keeper
        fEmpById[FU.sp],         // store_pricing
        fEmpById[FU.po],         // procurement_officer
        fEmpById[FU.p2],         // procurement_2nd
        FU.pm,                   // created_by
      ])

    // PO Lines — 4 raw materials
    const rmLines = [
      { ln: 1, pid: FP.cement,  desc: 'Portland Cement 52.5N — 50kg bags (320 bags per 40 panels)',  qty: 320,  price: 13000,   uom: 'bag',   vid: VENDOR_CEMENT },
      { ln: 2, pid: FP.rebar12, desc: 'Rebar Steel 12mm Grade 60 — structural reinforcement',          qty: 8,    price: 1620000, uom: 'ton',   vid: VENDOR_STEEL },
      { ln: 3, pid: FP.mesh,    desc: 'Welded Steel Mesh 6×2.4m — wall reinforcement (160 sheets)',    qty: 160,  price: 48000,   uom: 'sheet', vid: VENDOR_STEEL },
      { ln: 4, pid: FP.release, desc: 'Formwork Release Agent 200L drum — mould preparation',          qty: 2,    price: 320000,  uom: 'drum',  vid: VENDOR_CHEM },
    ]
    for (const l of rmLines) {
      await client.query(`
        INSERT INTO po_lines
          (po_id, line_number, description, product_id, qty_ordered, qty_received,
           unit_price, currency_code, uom, total_price,
           store_price, store_price_currency, store_price_notes)
        VALUES ($1,$2,$3,$4,$5,$5,$6,'IQD',$7,$8,$9,'IQD',$10)`,
        [PO_RM_ID, l.ln, l.desc, l.pid, l.qty, l.price,
         l.uom, l.qty * l.price,
         Math.round(l.price * 0.98),  // store price slightly lower
         'Market-verified: KCF / BSM / Tigris Chemical quotes cross-checked',
        ])
    }

    // ── Full Lifecycle Audit Trail ──────────────────────────────────────
    // Each transition documented with timestamps spread over 30 days
    const logEntries = [
      { from: 'opening',          to: 'inventory_check',   action: 'submit_to_inventory_check',  uid: FU.pm,    days: 45, notes: 'Submitted for inventory check. 40 panels required for Block C — urgent.' },
      { from: 'inventory_check',  to: 'store_pricing',     action: 'confirm_inventory_check',    uid: FU.sk,    days: 42, notes: 'Inventory check complete. Cement: 80 bags in stock (25% covered). Rebar: nil stock. Mesh: nil stock. All items to be procured externally.' },
      { from: 'store_pricing',    to: 'market_pricing',    action: 'submit_to_market_pricing',   uid: FU.sp,    days: 39, notes: 'Store prices submitted. In-stock cement priced at 13,000 IQD/bag. Remaining items forwarded to procurement for market quotes.' },
      { from: 'market_pricing',   to: 'price_verification',action: 'submit_to_price_verification',uid: FU.po,   days: 35, notes: 'Market quotes collected. Cement: KCF quoted 13,000 IQD. Rebar 12mm: BSM quoted 1,620,000 IQD/ton (3 suppliers checked). Steel mesh: BSM 48,000 IQD. Release agent: Tigris Chem 320,000 IQD/drum. Vendor: split order KCF + BSM + Tigris Chem.' },
      { from: 'price_verification',to: 'review',           action: 'submit_to_review',           uid: FU.p2,    days: 30, notes: 'Price verification complete. All quotes cross-checked against market index. Rebar price within 2% of IQD market rate. Cement within 1%. Approved for review. No adjustments.' },
      { from: 'review',           to: 'pending_approval',  action: 'request_approval',           uid: FU.pm,    days: 25, notes: 'Total IQD 33,747,000 (incl. 5% tax). Requesting management approval. Vendor split justified by best-price analysis.' },
      { from: 'pending_approval', to: 'dept_assigned',     action: 'assign_dept_head',           uid: FU.admin, days: 23, notes: 'Assigned to Precast Division head (Karwan Rashid) for approval.' },
      { from: 'dept_assigned',    to: 'approved',          action: 'approve',                    uid: FU.fm,    days: 20, notes: 'Approved. Amount within divisional budget. Proceed with purchase orders to KCF, BSM and Tigris Chemical.' },
      { from: 'approved',         to: 'completed',         action: 'complete',                   uid: FU.pm,    days: 5,  notes: 'All materials received and verified. Goods receipts recorded. Manufacturing order initiated.' },
    ]
    for (const e of logEntries) {
      const actorId = e.uid
      await client.query(`
        INSERT INTO po_approval_log
          (po_id, from_status, to_status, action, actor_id, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6, NOW() - ($7 * INTERVAL '1 day'))`,
        [PO_RM_ID, e.from, e.to, e.action, actorId, e.notes, e.days])
    }
    console.log('  ✓ PO-FNF-2025-001 created with', rmLines.length, 'lines')
    console.log('  ✓ Full lifecycle audit trail:', logEntries.length, 'transitions logged')
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 10 — BOM & WORK CENTER
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 10: BOM & Work Center ──')

  await client.query(`
    INSERT INTO work_centers
      (id, company_id, name, code, cost_per_hour, currency_code, capacity_hours_per_day, is_active, created_at)
    VALUES ($1,$2,'Precast Production Bay 1','WC-PRECAST-01',25000,'IQD',10,true,NOW())
    ON CONFLICT (company_id, code) DO NOTHING`,
    [WC_ID, FACTORY_ID])

  const bomEx = await client.query('SELECT id FROM boms WHERE id=$1', [BOM_ID])
  if (!bomEx.rows[0]) {
    await client.query(`
      INSERT INTO boms
        (id, company_id, finished_product_id, version, name, qty_produced,
         notes, is_active, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,'2.1',
        'Prefab Concrete Wall Panel 3m×6m — Grade C40 (1 panel)',
        1,
        'Designed per ACI 318. 200mm thickness. Double-layer reinforcement. Lifting anchors embedded.',
        true,$4,NOW(),NOW())`,
      [BOM_ID, FACTORY_ID, FP.panel, FU.pm])

    // BOM lines — components per 1 panel
    const bomLines = [
      { seq: 1, pid: FP.cement,  qty: 8,    uom: 'bag',   hrs: 0.5,  note: '8 bags (400kg) per panel — C40 mix design' },
      { seq: 2, pid: FP.rebar12, qty: 0.2,  uom: 'ton',   hrs: 1.5,  note: '200kg rebar — main vertical & horizontal bars' },
      { seq: 3, pid: FP.mesh,    qty: 4,    uom: 'sheet', hrs: 0.75, note: '4 mesh sheets — outer & inner face reinforcement' },
      { seq: 4, pid: FP.release, qty: 0.05, uom: 'drum',  hrs: 0.1,  note: '10L release agent per panel mould preparation' },
    ]
    for (const bl of bomLines) {
      await client.query(`
        INSERT INTO bom_lines
          (bom_id, component_product_id, qty_required, uom, work_center_id,
           operation_time_hours, sequence, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [BOM_ID, bl.pid, bl.qty, bl.uom, WC_ID, bl.hrs, bl.seq, bl.note])
    }
    console.log('  ✓ BOM created: Prefab Wall Panel 3m×6m v2.1 — 4 components')
  } else {
    console.log('  ✓ BOM already exists')
  }
  console.log('  ✓ Work center: Precast Production Bay 1 (IQD 25,000/hr, 10hr/day)')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 11 — MANUFACTURING ORDER (40 panels)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 11: Manufacturing Order ──')

  const moEx = await client.query('SELECT id FROM manufacturing_orders WHERE id=$1', [MO_ID])
  if (!moEx.rows[0]) {
    // Cost: (320 bags × 13,000) + (8 ton × 1,620,000) + (160 sheets × 48,000) + (2 drums × 320,000)
    //       = 4,160,000 + 12,960,000 + 7,680,000 + 640,000 = 25,440,000  raw materials
    // Labor/WC: 40 panels × (0.5+1.5+0.75+0.1) hrs × 25,000 = 40 × 2.85 × 25,000 = 2,850,000
    // Total actual: 28,290,000 IQD
    const plannedCost = 29000000   // budgeted
    const actualCost  = 28290000   // final

    await client.query(`
      INSERT INTO manufacturing_orders
        (id, company_id, mo_number, bom_id, finished_product_id, project_id,
         analytic_account_id, qty_planned, qty_produced, dispatch_type,
         destination_location_id, status,
         scheduled_start, scheduled_end, actual_start, actual_end,
         planned_cost, actual_cost, currency_code,
         notes, created_by, created_at, updated_at)
      VALUES
        ($1,$2,'MO-FNF-2025-001',$3,$4,$5,$6,
         40,40,'direct_to_site',$7,'completed',
         '2025-05-25','2025-06-15',
         '2025-05-25 07:00:00','2025-06-14 16:30:00',
         $8,$9,'IQD',
         'Manufacture 40 prefab concrete wall panels for Nishtimani Yakam Co — Al-Mansour Residential Complex Block C. Dispatch direct to Al-Mansour site.',
         $10,NOW() - INTERVAL '30 days',NOW() - INTERVAL '6 days')`,
      [MO_ID, FACTORY_ID, BOM_ID, FP.panel, PROJECT_C, AA.factory_prefab,
       SL_YAKAM_SITE, plannedCost, actualCost, FU.pm])

    // Material consumptions (actual = planned for clean run)
    const consumptions = [
      { pid: FP.cement,  planned: 320,  consumed: 325,  unitCost: 13000   },  // 5 extra bags (breakage)
      { pid: FP.rebar12, planned: 8,    consumed: 8,    unitCost: 1620000 },
      { pid: FP.mesh,    planned: 160,  consumed: 162,  unitCost: 48000   },  // 2 sheets waste
      { pid: FP.release, planned: 2,    consumed: 2,    unitCost: 320000  },
    ]

    // Get bom_line IDs
    const bomLineRows = await client.query(
      'SELECT id, component_product_id FROM bom_lines WHERE bom_id=$1', [BOM_ID])
    const bomLineByPid = {}
    for (const r of bomLineRows.rows) bomLineByPid[r.component_product_id] = r.id

    for (const c of consumptions) {
      await client.query(`
        INSERT INTO mo_consumptions
          (mo_id, component_product_id, bom_line_id, qty_planned, qty_consumed,
           unit_cost, total_cost, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() - INTERVAL '6 days')`,
        [MO_ID, c.pid, bomLineByPid[c.pid] || null,
         c.planned, c.consumed, c.unitCost, c.consumed * c.unitCost])
    }

    // Work center time
    const wcTimeEx = await client.query(
      'SELECT id FROM mo_work_center_time WHERE mo_id=$1 AND work_center_id=$2 LIMIT 1', [MO_ID, WC_ID])
    if (!wcTimeEx.rows[0]) {
      await client.query(`
        INSERT INTO mo_work_center_time
          (mo_id, work_center_id, planned_hours, actual_hours, cost_per_hour, total_cost,
           recorded_by, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() - INTERVAL '6 days')`,
        [MO_ID, WC_ID, 114, 118.5, 25000, 118.5 * 25000, FU.pm])
    }

    // Update panel product average cost
    const costPerPanel = Math.round(28290000 / 40)
    await client.query(
      'UPDATE products SET average_cost=$1, standard_cost=$1 WHERE id=$2',
      [costPerPanel, FP.panel])

    console.log('  ✓ MO-FNF-2025-001: 40 panels completed (IQD 28,290,000 actual cost)')
    console.log('  ✓ Material consumptions recorded | WC time: 118.5 hrs')
    console.log('  ✓ Panel average cost set: IQD', costPerPanel.toLocaleString(), '/panel')
  } else {
    console.log('  ✓ Manufacturing order already exists')
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 12 — EQUIPMENT ASSET: TOWER CRANE
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 12: Equipment asset — Tower Crane ──')

  await client.query(`
    INSERT INTO equipment_assets
      (id, company_id, asset_number, name, category, model, serial_number,
       year_of_manufacture, daily_rate, weekly_rate, monthly_rate, currency_code,
       purchase_cost, purchase_date, status, current_location_id,
       is_active, notes, created_at, updated_at)
    VALUES
      ($1,$2,'FNF-CRN-001',
       'Tower Crane Liebherr 280 EC-H 16 Litronic',
       'Lifting Equipment','Liebherr 280 EC-H','TC-280-2021-0447',
       2021,
       350000, 2100000, 3500000, 'IQD',
       4200000000, '2021-09-15',
       'rented', $3,
       true,
       'Max jib: 65m. Max load: 16t at 16m / 3.5t at 65m. Erected at Al-Mansour Block C since 2025-07-16.',
       NOW(),NOW())
    ON CONFLICT (company_id, asset_number) DO NOTHING`,
    [CRANE_ID, FACTORY_ID, SL_YAKAM_SITE])
  console.log('  ✓ Liebherr 280 EC-H Tower Crane registered (IQD 3.5M/month)')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 13 — INTERNAL RENTAL CONTRACT (Factory → Yakam, 3 months)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 13: Internal equipment rental contract ──')

  await client.query(`
    INSERT INTO rental_contracts
      (id, company_id, contract_number, rental_type, to_company_id,
       project_id, billing_cycle, rate_amount, currency_code,
       start_date, end_date, status,
       revenue_account_id, analytic_account_id,
       created_by, created_at, updated_at)
    VALUES
      ($1,$2,'RC-FNF-2025-001','internal',$3,$4,
       'monthly',3500000,'IQD',
       '2025-07-16','2025-10-15','active',
       $5,$6,$7,NOW(),NOW())
    ON CONFLICT (company_id, contract_number) DO NOTHING`,
    [RC_ID, FACTORY_ID, YAKAM_ID, PROJECT_C,
     coa(FACTORY_ID, factoryRentalRevCode), AA.factory_rental, FU.pm])

  // Rental contract line (the crane) — guard against re-run duplicates
  // Schema: contract_id, asset_id, qty, daily_rate, currency_code, deployment_location_id
  const rcLineEx = await client.query(
    'SELECT id FROM rental_contract_lines WHERE contract_id=$1 LIMIT 1', [RC_ID])
  if (!rcLineEx.rows[0]) {
    await client.query(`
      INSERT INTO rental_contract_lines
        (contract_id, asset_id, qty, daily_rate, currency_code, deployment_location_id)
      VALUES ($1,$2,1,116667,'IQD',$3)`,
      [RC_ID, CRANE_ID, SL_YAKAM_SITE])  // daily_rate ≈ 3,500,000/30 ≈ 116,667 IQD/day
  }

  // Invoice month 1 (paid) + month 2 (paid) + month 3 (sent)
  // Schema: contract_id, invoice_number, billing_period_start, billing_period_end, days_billed, amount, currency_code, status
  const rentalInvoices = [
    { num: 'RINV-FNF-2025-001', ps: '2025-07-16', pe: '2025-07-31', days: 16, amount: 1866672, status: 'paid'  },  // 16 × 116,667
    { num: 'RINV-FNF-2025-002', ps: '2025-08-01', pe: '2025-08-31', days: 31, amount: 3616677, status: 'paid'  },
    { num: 'RINV-FNF-2025-003', ps: '2025-09-01', pe: '2025-09-30', days: 30, amount: 3500010, status: 'issued' },
  ]
  for (const inv of rentalInvoices) {
    const exInv = await client.query(
      'SELECT id FROM rental_invoices WHERE invoice_number=$1 LIMIT 1', [inv.num])
    if (!exInv.rows[0]) {
      await client.query(`
        INSERT INTO rental_invoices
          (contract_id, invoice_number, billing_period_start, billing_period_end,
           days_billed, amount, currency_code, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,'IQD',$7,NOW())`,
        [RC_ID, inv.num, inv.ps, inv.pe, inv.days, inv.amount, inv.status])
    }
  }
  console.log('  ✓ Rental RC-FNF-2025-001: 3 months IQD 10,500,000 total')
  console.log('  ✓ Invoices: 2 paid (IQD 5,250,000) + 1 sent (IQD 3,500,000) pending')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 14 — INTERCOMPANY TRANSACTION (prefab goods transfer)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 14: Intercompany transaction ──')

  // Transfer price = actual cost × 1.25 markup (cost_plus config)
  const transferPrice = Math.round(28290000 * 1.25)  // 35,362,500 IQD

  await client.query(`
    INSERT INTO interco_transactions
      (id, from_company_id, to_company_id, transaction_type, amount, currency_code,
       description, reference, status, created_by, created_at, updated_at)
    VALUES ($1,$2,$3,'goods_transfer',$4,'IQD',
      '40× Prefab Concrete Wall Panels 3m×6m (Grade C40) — manufactured per BOM v2.1. Dispatched to Al-Mansour Block C site 2025-06-15. MO-FNF-2025-001.',
      'IT-FNF-YAK-2025-001',
      'posted',$5,
      NOW() - INTERVAL '5 days',
      NOW() - INTERVAL '5 days')
    ON CONFLICT (id) DO NOTHING`,
    [IT_ID, FACTORY_ID, YAKAM_ID, transferPrice, FU.fm])
  console.log('  ✓ Interco transfer posted: IQD', transferPrice.toLocaleString(), '(cost + 25% markup)')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 15 — JOURNAL ENTRIES (Finance)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 15: Journal entries ──')

  const jeInsert = async (id, cid, ref, desc, date, src_type, src_id, uid, lines) => {
    await client.query(`
      INSERT INTO journal_entries
        (id, company_id, reference, description, entry_date, status,
         source_type, source_id, created_by, posted_at, posted_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'posted',$6,$7,$8,$5::date,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [id, cid, ref, desc, date, src_type, src_id, uid])

    for (const l of lines) {
      const [acct, aa, dr, cr, desc2, cur] = l
      const amount = Math.max(dr, cr)
      await client.query(`
        INSERT INTO journal_lines
          (journal_entry_id, account_id, analytic_account_id,
           description, debit, credit, currency_code, fx_rate, amount_company_currency)
        VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8)`,
        [id, acct, aa || null, desc2, dr, cr, cur || 'IQD', amount])
    }
  }

  // ── Factory JE-1: Raw materials purchased (PO receipt) ──────────────────
  await jeInsert(JE.f_raw_purchase, FACTORY_ID,
    'JE-FNF-2025-0012', 'Raw Materials Purchased — PO-FNF-2025-001', '2025-05-20',
    'purchase_order', PO_RM_ID, FU.fm,
    [
      [coa(FACTORY_ID,'1310'), AA.factory_prefab, 32140000, 0,        'Raw materials received per PO-FNF-2025-001', 'IQD'],
      [coa(FACTORY_ID,'2100'), null,              0,         32140000, 'AP — vendors KCF / BSM / Tigris Chem',       'IQD'],
    ])

  // ── Factory JE-2: Manufacturing cost transfer (RM → WIP → Finished) ────
  await jeInsert(JE.f_mfg_cost, FACTORY_ID,
    'JE-FNF-2025-0018', 'MO-FNF-2025-001 — Cost Transfer to Finished Goods', '2025-06-14',
    'manufacturing_order', MO_ID, FU.fm,
    [
      [coa(FACTORY_ID,'1310'), AA.factory_prefab, 0,        25440000, 'Raw materials consumed — 325 bags cement, 8t rebar, 162 mesh, 2 drums release agent', 'IQD'],
      [coa(FACTORY_ID,'5100'), AA.factory_prefab, 2850000,  0,        'WC labor: 118.5 hrs × IQD 25,000 — Precast Bay 1',  'IQD'],
      [coa(FACTORY_ID,'5100'), AA.factory_prefab, 0,        2850000,  'Manufacturing overhead reclassified to finished goods', 'IQD'],
      [coa(FACTORY_ID,'1320'), AA.factory_prefab, 28290000, 0,        '40 panels @ IQD 707,250 each — transferred to finished goods', 'IQD'],
      [coa(FACTORY_ID,'1310'), AA.factory_prefab, 25440000, 0,        'Re-class raw material to cost of production', 'IQD'],
      [coa(FACTORY_ID,'1320'), AA.factory_prefab, 0,        28290000, 'Net finished goods inventory',                'IQD'],
    ])

  // ── Factory JE-3: Interco revenue — goods transfer to Yakam ─────────────
  await jeInsert(JE.f_interco_rev, FACTORY_ID,
    'JE-FNF-2025-0021', 'Interco Revenue — 40 Prefab Panels to Yakam Co', '2025-06-15',
    'interco_transaction', IT_ID, FU.fm,
    [
      [coa(FACTORY_ID,'1210'), AA.factory_prefab, transferPrice, 0,             'Interco receivable — Nishtimani Yakam Co', 'IQD'],
      [coa(FACTORY_ID,'4000'), AA.factory_prefab, 0,             transferPrice, 'Manufacturing revenue (cost + 25%)',       'IQD'],
    ])

  // ── Factory JE-4: Crane rental revenue (invoices 1+2 paid) ──────────────
  const rentalPaidAmt = 1866672 + 3616677  // months 1 + 2
  await jeInsert(JE.f_rental_rev, FACTORY_ID,
    'JE-FNF-2025-0024', 'Equipment Rental Revenue — Crane to Yakam (Jul–Aug 2025)', '2025-08-31',
    'rental_contract', RC_ID, FU.fm,
    [
      [coa(FACTORY_ID,'1100'),              AA.factory_rental, rentalPaidAmt, 0,             'Cash received — crane rental invoices RINV-001 + RINV-002', 'IQD'],
      [coa(FACTORY_ID, factoryRentalRevCode), AA.factory_rental, 0, rentalPaidAmt,           'Rental revenue — Liebherr 280 EC-H (Jul 16 – Aug 31)',      'IQD'],
    ])

  // ── Yakam JE-5: Prefab panels received (interco goods) ──────────────────
  await jeInsert(JE.y_interco_rcv, YAKAM_ID,
    'JE-YAK-2025-0031', 'Prefab Panels Received from Nishtimani Factory — Block C', '2025-06-15',
    'interco_transaction', IT_ID, FU.admin,
    [
      [coa(YAKAM_ID,'1400'), AA.yakam_blockc, transferPrice, 0,             '40× Prefab Wall Panels 3m×6m — added to Block C WIP', 'IQD'],
      [coa(YAKAM_ID,'2150'), AA.yakam_blockc, 0,             transferPrice, 'Interco payable — Nishtimani Factory',                'IQD'],
    ])

  // ── Yakam JE-6: Crane rental expense ────────────────────────────────────
  await jeInsert(JE.y_rental_exp, YAKAM_ID,
    'JE-YAK-2025-0038', 'Tower Crane Rental Expense — Block C (Jul–Aug 2025)', '2025-08-31',
    'rental_contract', RC_ID, FU.admin,
    [
      [coa(YAKAM_ID,'6100'), AA.yakam_blockc, rentalPaidAmt, 0,             'Crane hire — Liebherr 280 EC-H (16 Jul – 31 Aug)', 'IQD'],
      [coa(YAKAM_ID,'2150'), AA.yakam_blockc, 0,             rentalPaidAmt, 'Interco payable — Factory crane rental',           'IQD'],
    ])

  // ── Yakam JE-7: Procurement costs booked for Block C related POs ─────────
  const blockCPOCost = 15750000
  await jeInsert(JE.y_po_expense, YAKAM_ID,
    'JE-YAK-2025-0015', 'Project Procurement Costs Accrual — Block C Q2-2025', '2025-06-30',
    'project', PROJECT_C, FU.admin,
    [
      [coa(YAKAM_ID,'1400'), AA.yakam_blockc, blockCPOCost, 0,             'Procurement costs accrued to Block C WIP (materials + subcon)', 'IQD'],
      [coa(YAKAM_ID,'2100'), null,            0,             blockCPOCost, 'Accounts payable — various vendors Block C Q2',                 'IQD'],
    ])

  console.log('  ✓ Journal entries posted: 7 total (4 Factory + 3 Yakam)')
  console.log('  ├─ Factory: raw material purchase, MFG cost, interco revenue, rental revenue')
  console.log('  └─ Yakam:   interco goods receipt, crane rental expense, project cost accrual')

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 16 — PO EDIT REQUEST EXAMPLE
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── Section 16: PO edit request example ──')

  // Get the Yakam PO-2024-0005 (Formwork & scaffolding — in price_verification)
  const yakamPO5 = await client.query(
    "SELECT id FROM purchase_orders WHERE po_number='PO-2024-0005' AND company_id=$1", [YAKAM_ID])
  const po5id = yakamPO5.rows[0]?.id

  if (po5id) {
    // Check if an edit request already exists
    const erEx = await client.query(
      "SELECT id FROM po_edit_requests WHERE po_id=$1 LIMIT 1", [po5id])
    if (!erEx.rows[0]) {
      const yakamProcUid = await client.query(
        "SELECT id FROM users WHERE email='procurement@fnc.test'")
      const requestorId = yakamProcUid.rows[0]?.id

      if (requestorId) {
        const changes = JSON.stringify({
          header: {},
          lines: {
            edited: [
              { id: 'line-placeholder', field: 'qty_ordered', from: 400, to: 460,
                note: 'Additional formwork panels required for revised floor plan — 15% area increase approved by PM' },
              { id: 'line-placeholder-2', field: 'qty_ordered', from: 80, to: 90,
                note: 'Extra scaffolding sets needed for Level 4 extended overhang' },
            ],
            added: [],
            removed: [],
          },
        })

        await client.query(`
          INSERT INTO po_edit_requests
            (po_id, requested_by, status, changes, request_notes, created_at)
          VALUES ($1,$2,'pending',$3,
            'Floor plan revision (Rev C, issued 2025-06-20) increases wall formwork area by 15%. PM Ahmed Al-Rashid approved scope change on 2025-06-22. Requesting 60 additional formwork panels and 10 extra scaffolding sets.',
            NOW() - INTERVAL '2 days')`,
          [po5id, requestorId, changes])
        console.log('  ✓ PO edit request created on PO-2024-0005 (pending admin approval)')
        console.log('    Change: +60 formwork panels, +10 scaffolding sets — floor plan revision')
      }
    } else {
      console.log('  ✓ Edit request already exists on PO-2024-0005')
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 17 — FINAL SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65))
  console.log('  SCENARIO COMPLETE — AL-MANSOUR BLOCK C / PREFAB WALLS')
  console.log('═'.repeat(65))

  const summary = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM companies WHERE id IN ($1,$2)) AS companies,
      (SELECT COUNT(*) FROM users WHERE email LIKE '%@fnc.test') AS test_users,
      (SELECT COUNT(*) FROM analytic_accounts WHERE company_id IN ($1,$2)) AS analytic_accounts,
      (SELECT COUNT(*) FROM chart_of_accounts WHERE company_id IN ($1,$2)) AS coa_entries,
      (SELECT COUNT(*) FROM projects WHERE company_id=$1 AND id=$3) AS yakam_block_c,
      (SELECT status FROM projects WHERE id=$3) AS block_c_status,
      (SELECT COUNT(*) FROM purchase_orders WHERE company_id=$2) AS factory_pos,
      (SELECT status FROM purchase_orders WHERE id=$4) AS factory_po_status,
      (SELECT COUNT(*) FROM boms WHERE company_id=$2) AS boms,
      (SELECT COUNT(*) FROM manufacturing_orders WHERE company_id=$2) AS mos,
      (SELECT qty_produced FROM manufacturing_orders WHERE id=$5) AS panels_produced,
      (SELECT COUNT(*) FROM equipment_assets WHERE company_id=$2) AS equipment_assets,
      (SELECT COUNT(*) FROM rental_contracts WHERE company_id=$2) AS rental_contracts,
      (SELECT COUNT(*) FROM rental_invoices ri JOIN rental_contracts rc ON rc.id=ri.contract_id WHERE rc.company_id=$2) AS rental_invoices,
      (SELECT COUNT(*) FROM interco_transactions WHERE id=$6) AS interco_txns,
      (SELECT COUNT(*) FROM journal_entries WHERE company_id IN ($1,$2) AND reference LIKE 'JE-%') AS journal_entries,
      (SELECT COUNT(*) FROM po_edit_requests WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)) AS pending_edit_requests
    `,
    [YAKAM_ID, FACTORY_ID, PROJECT_C, PO_RM_ID, MO_ID, IT_ID])

  const s = summary.rows[0]
  console.log(`
  Companies:              ${s.companies}  (Yakam + Factory)
  Test users:             ${s.test_users}
  Analytic accounts:      ${s.analytic_accounts}  (2 per company)
  Chart of accounts:      ${s.coa_entries} entries (10 per company)
  Block C project:        ${s.yakam_block_c === '1' ? '✓' : '✗'} — status: ${s.block_c_status}
  Factory POs:            ${s.factory_pos}  (raw materials — fully lifecycle'd)
  Factory PO status:      ${s.factory_po_status}
  BOMs:                   ${s.boms}  (Prefab Wall Panel v2.1)
  Manufacturing orders:   ${s.mos}  — ${s.panels_produced} panels produced
  Equipment assets:       ${s.equipment_assets}  (Liebherr 280 EC-H crane)
  Rental contracts:       ${s.rental_contracts}  (3 months, Factory→Yakam)
  Rental invoices:        ${s.rental_invoices}  (2 paid + 1 sent)
  Interco transactions:   ${s.interco_txns}  (IQD ${(35362500).toLocaleString()} goods transfer)
  Journal entries:        ${s.journal_entries}  (4 Factory + 3 Yakam, all posted)
  Pending edit requests:  ${s.pending_edit_requests}  (formwork qty revision on PO-2024-0005)
`)

  console.log('  LOGINS')
  console.log('  ───────────────────────────────────────────────')
  console.log('  Yakam users:   pm@fnc.test / procurement@fnc.test / ...')
  console.log('  Factory admin: factory.admin@fnc.test   → system_admin')
  console.log('  Factory PM:    factory.pm@fnc.test      → module_admin')
  console.log('  Factory SK:    factory.sk@fnc.test      → store_keeper position')
  console.log('  Factory PO:    factory.po@fnc.test      → procurement_officer position')
  console.log('  Factory FM:    factory.fm@fnc.test      → dept-head approver')
  console.log('  All passwords: Test@1234')
  console.log('')
  console.log('  SCENARIO FLOW SUMMARY')
  console.log('  ───────────────────────────────────────────────')
  console.log('  1. Yakam Block C project created (status: active, 7 stages)')
  console.log('  2. Factory sources raw materials via PO-FNF-2025-001:')
  console.log('     opening → inv_check → store_pricing → market_pricing')
  console.log('     → price_verification → review → pending_approval')
  console.log('     → dept_assigned → approved → COMPLETED')
  console.log('  3. Factory manufactures 40 prefab panels (MO-FNF-2025-001)')
  console.log('     BOM: cement + rebar + mesh + release agent')
  console.log('     Actual cost: IQD 28,290,000 | IQD 707,250/panel')
  console.log('  4. Tower crane (Liebherr 280 EC-H) rented to Yakam')
  console.log('     3 months @ IQD 3,500,000/month = IQD 10,500,000 total')
  console.log('  5. Interco goods transfer posted: IQD 35,362,500 (cost+25%)')
  console.log('  6. Journal entries posted — both companies balanced')
  console.log('  7. Pending edit request on Yakam PO-2024-0005 (formwork +15%)')
  console.log('═'.repeat(65))

  await client.end()
}

seed().catch(function(e) {
  console.error('\n✗ FATAL:', e.message)
  if (e.detail) console.error('  Detail:', e.detail)
  if (e.constraint) console.error('  Constraint:', e.constraint)
  if (e.table) console.error('  Table:', e.table)
  process.exit(1)
})
