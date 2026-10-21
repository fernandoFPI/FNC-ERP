// System-admin bypass of the goods-receipt photo requirement (vendor receipt +
// materials photo). Confirming a receipt moves real stock and cost, so the override
// is system_admin only, needs a written reason, is enforced on the server (not just
// hidden in the UI), and leaves a po_approval_log row and an audit_log row.
// Real-Postgres pattern, nothing mocked: stock balances and log rows are read back.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { resolvePhotoBypass } from '../src/lib/receiptPhotoBypass.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'receipt-photo-bypass-test-'
const SKU_PREFIX = 'PBTEST-'
const PO_PREFIX = 'PBTEST-PO-'
const PROJECT_CODE = 'PBTEST-PRJ'

let adminId: string
let companyAdminId: string
let editorId: string
let warehouseId: string

const ctxFor = (userId: string, role: string) =>
  ({
    auth: { companyId: TEST_COMPANY_ID, userId, role, module: 'all', sessionId: 'pb-test' },
  }) as never

async function makeUser(key: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`],
  )
  return r.rows[0]!.id
}

async function makeProduct(): Promise<string> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  return r.rows[0]!.id
}

async function makePO(extra?: {
  projectId?: string
}): Promise<{ poId: string; lineId: string; productId: string }> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const productId = await makeProduct()
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, purpose, linked_project_id, delivery_destination)
     VALUES ($1,$2,$3,'bought','IQD',$4,$5,$6) RETURNING id`,
    [
      TEST_COMPANY_ID,
      poNumber,
      adminId,
      extra?.projectId ? 'project' : 'stock',
      extra?.projectId ?? null,
      extra?.projectId ? 'jobsite' : null,
    ],
  )
  const line = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price)
     VALUES ($1,1,'test line',$2,5,10,50) RETURNING id`,
    [po.rows[0]!.id, productId],
  )
  return { poId: po.rows[0]!.id, lineId: line.rows[0]!.id, productId }
}

// A draft Store In receipt for the PO's one line, as recordReceipt creates it.
async function draftReceipt(poId: string, lineId: string): Promise<string> {
  const r = (await resolvers.Mutation.recordReceipt(
    null,
    {
      poId,
      input: {
        receipt_date: '2026-01-15',
        location_id: warehouseId,
        lines: [{ po_line_id: lineId, qty_received: 5, actual_unit_price: 10 }],
      },
    } as never,
    ctxFor(adminId, 'system_admin'),
  )) as { id: string }
  return r.id
}

async function attach(
  receiptId: string,
  category: 'po_receipt_photo' | 'po_receipt_document',
): Promise<void> {
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'test.jpg','image/jpeg',100,$4,'attached') RETURNING id`,
    [
      TEST_COMPANY_ID,
      adminId,
      `pbtest-${category}-${receiptId}-${Math.random().toString(36).slice(2, 8)}`,
      category,
    ],
  )
  await pool.query(
    `INSERT INTO document_attachments (entity_type, entity_id, file_id, uploaded_by) VALUES ('po_receipt',$1,$2,$3)`,
    [receiptId, f.rows[0]!.id, adminId],
  )
}

const confirm = (
  receiptId: string,
  role: string,
  userId: string,
  args: { bypassPhotos?: boolean; bypassReason?: string } = {},
) =>
  resolvers.Mutation.confirmReceipt(
    null,
    { id: receiptId, ...args } as never,
    ctxFor(userId, role),
  ) as Promise<{
    status: string
  }>

async function balance(productId: string): Promise<number> {
  const r = await pool.query<{ qty_on_hand: string }>(
    `SELECT qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, warehouseId],
  )
  return parseFloat(r.rows[0]?.qty_on_hand ?? '0')
}

async function receiptStatus(receiptId: string): Promise<string> {
  const r = await pool.query<{ status: string }>(`SELECT status FROM po_receipts WHERE id=$1`, [
    receiptId,
  ])
  return r.rows[0]!.status
}

async function bypassLog(poId: string): Promise<string[]> {
  const r = await pool.query<{ notes: string }>(
    `SELECT notes FROM po_approval_log WHERE po_id=$1 AND action='receipt_photos_bypassed' ORDER BY created_at`,
    [poId],
  )
  return r.rows.map((x) => x.notes)
}

async function bypassAudit(
  recordId: string,
): Promise<{ new_values: { skipped?: string[]; reason?: string; kind?: string } }[]> {
  const r = await pool.query(
    `SELECT new_values FROM audit_log WHERE action='receipt_photos_bypassed' AND record_id=$1`,
    [recordId],
  )
  return r.rows as never
}

async function cleanup(): Promise<void> {
  const pos = `SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`
  const args = [TEST_COMPANY_ID, `${PO_PREFIX}%`]
  await pool.query(
    `DELETE FROM project_cost_actuals WHERE source_id IN (SELECT id FROM po_lines WHERE po_id IN (${pos}))`,
    args,
  )
  await pool.query(`DELETE FROM pending_product_catalog_items WHERE po_id IN (${pos})`, args)
  await pool.query(
    `DELETE FROM document_attachments WHERE entity_type='po_receipt' AND entity_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))`,
    args,
  )
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE 'pbtest-%'`, [
    TEST_COMPANY_ID,
  ])
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND (po_line_id IN (SELECT id FROM po_lines WHERE po_id IN (${pos})) OR product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $3))`,
    [...args, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_receipt_lines WHERE receipt_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))`,
    args,
  )
  await pool.query(`DELETE FROM po_receipts WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, args)
  await pool.query(
    `DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [
    TEST_COMPANY_ID,
    `${SKU_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code=$2`, [
    TEST_COMPANY_ID,
    PROJECT_CODE,
  ])
}

beforeAll(async () => {
  adminId = await makeUser('system-admin')
  companyAdminId = await makeUser('company-admin')
  editorId = await makeUser('editor')
  await pool.query(
    `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level) VALUES ($1,$2,'procurement.po.edit','edit')
     ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level`,
    [editorId, TEST_COMPANY_ID],
  )
  const wh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!wh.rows[0])
    throw new Error('No warehouse location seeded for the test company - run seeds first')
  warehouseId = wh.rows[0].id
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  // audit_log rows the override tests wrote (keyed by this suite's own user ids).
  await pool
    .query(
      `DELETE FROM audit_log WHERE action='receipt_photos_bypassed' AND user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [`${EMAIL_PREFIX}%`],
    )
    .catch(() => undefined)
  await pool.query(
    `DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`${EMAIL_PREFIX}%`],
  )
  await pool
    .query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
    .catch(() => undefined)
  await pool.end()
})

describe('resolvePhotoBypass', () => {
  it('returns null when no override was asked for, whoever asks', () => {
    expect(resolvePhotoBypass('system_admin', false, null)).toBeNull()
    expect(resolvePhotoBypass('user', undefined, 'ignored')).toBeNull()
  })

  it('allows only system_admin, with a trimmed reason', () => {
    expect(resolvePhotoBypass('system_admin', true, '  vendor sent it by email  ')).toEqual({
      reason: 'vendor sent it by email',
    })
    for (const role of ['company_admin', 'module_admin', 'user']) {
      expect(() => resolvePhotoBypass(role, true, 'reason')).toThrow(/Only a system administrator/)
    }
  })

  it('needs a reason, and caps its length', () => {
    expect(() => resolvePhotoBypass('system_admin', true, undefined)).toThrow(/reason is required/)
    expect(() => resolvePhotoBypass('system_admin', true, '   ')).toThrow(/reason is required/)
    expect(() => resolvePhotoBypass('system_admin', true, 'x'.repeat(501))).toThrow(
      /500 characters/,
    )
  })
})

describe('confirmReceipt without photos', () => {
  it('still refuses without a bypass, even for a system admin (the control is unchanged)', async () => {
    const { poId, lineId } = await makePO()
    const rid = await draftReceipt(poId, lineId)
    await expect(confirm(rid, 'system_admin', adminId)).rejects.toThrow(/materials photo/)
    expect(await receiptStatus(rid)).toBe('draft')
  })

  it('refuses a bypass from company_admin and from an ordinary editor, and changes nothing', async () => {
    const { poId, lineId, productId } = await makePO()
    const rid = await draftReceipt(poId, lineId)
    await expect(
      confirm(rid, 'company_admin', companyAdminId, { bypassPhotos: true, bypassReason: 'trying' }),
    ).rejects.toThrow(/Only a system administrator/)
    await expect(
      confirm(rid, 'user', editorId, { bypassPhotos: true, bypassReason: 'trying' }),
    ).rejects.toThrow(/Only a system administrator/)
    expect(await receiptStatus(rid)).toBe('draft')
    expect(await balance(productId)).toBe(0)
    expect(await bypassLog(poId)).toEqual([])
  })

  it('refuses a bypass without a reason', async () => {
    const { poId, lineId } = await makePO()
    const rid = await draftReceipt(poId, lineId)
    await expect(confirm(rid, 'system_admin', adminId, { bypassPhotos: true })).rejects.toThrow(
      /reason is required/,
    )
    expect(await receiptStatus(rid)).toBe('draft')
  })

  it('lets a system admin confirm with no photos: stock moves, and the override is logged twice', async () => {
    const { poId, lineId, productId } = await makePO()
    const rid = await draftReceipt(poId, lineId)
    const out = await confirm(rid, 'system_admin', adminId, {
      bypassPhotos: true,
      bypassReason: 'Photos lost with the old phone',
    })
    expect(out.status).toBe('confirmed')
    expect(await receiptStatus(rid)).toBe('confirmed')
    expect(await balance(productId)).toBe(5)

    const log = await bypassLog(poId)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatch(/without the materials photo and vendor receipt/)
    expect(log[0]).toMatch(/Photos lost with the old phone/)

    const audit = await bypassAudit(rid)
    expect(audit).toHaveLength(1)
    expect(audit[0]!.new_values.skipped?.sort()).toEqual(['materials photo', 'vendor receipt'])
    expect(audit[0]!.new_values.reason).toBe('Photos lost with the old phone')
  })

  it('records only what was actually skipped (vendor receipt present, materials photo missing)', async () => {
    const { poId, lineId } = await makePO()
    const rid = await draftReceipt(poId, lineId)
    await attach(rid, 'po_receipt_document')
    await confirm(rid, 'system_admin', adminId, {
      bypassPhotos: true,
      bypassReason: 'no camera on site',
    })
    const audit = await bypassAudit(rid)
    expect(audit[0]!.new_values.skipped).toEqual(['materials photo'])
  })

  it('logs nothing when the admin ticks the override but every photo is already there', async () => {
    const { poId, lineId } = await makePO()
    const rid = await draftReceipt(poId, lineId)
    await attach(rid, 'po_receipt_photo')
    await attach(rid, 'po_receipt_document')
    const out = await confirm(rid, 'system_admin', adminId, {
      bypassPhotos: true,
      bypassReason: 'just in case',
    })
    expect(out.status).toBe('confirmed')
    expect(await bypassLog(poId)).toEqual([])
    expect(await bypassAudit(rid)).toEqual([])
  })

  it('is unchanged for everyone else: both photos present confirms as before', async () => {
    const { poId, lineId, productId } = await makePO()
    const rid = await draftReceipt(poId, lineId)
    await attach(rid, 'po_receipt_photo')
    await attach(rid, 'po_receipt_document')
    expect((await confirm(rid, 'user', editorId)).status).toBe('confirmed')
    expect(await balance(productId)).toBe(5)
  })
})

describe('recordDirectDelivery bypass declaration', () => {
  async function jobsitePO() {
    const prj = await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3)
       ON CONFLICT DO NOTHING RETURNING id`,
      [TEST_COMPANY_ID, PROJECT_CODE, adminId],
    )
    const projectId =
      prj.rows[0]?.id ??
      (
        await pool.query<{ id: string }>(
          `SELECT id FROM projects WHERE company_id=$1 AND code=$2`,
          [TEST_COMPANY_ID, PROJECT_CODE],
        )
      ).rows[0]!.id
    return makePO({ projectId })
  }
  const deliver = (
    poId: string,
    lineId: string,
    role: string,
    userId: string,
    extra: Record<string, unknown> = {},
  ) =>
    resolvers.Mutation.recordDirectDelivery(
      null,
      {
        poId,
        input: {
          received_date: '2026-01-15',
          lines: [{ po_line_id: lineId, qty_received: 5 }],
          ...extra,
        },
      } as never,
      ctxFor(userId, role),
    ) as Promise<{ status: string }>

  it('records the declaration (and why) when a system admin skips the photos', async () => {
    const { poId, lineId } = await jobsitePO()
    const out = await deliver(poId, lineId, 'system_admin', adminId, {
      bypassPhotos: true,
      bypassReason: 'delivery note only',
    })
    expect(out.status).toBe('goods_received')
    const log = await bypassLog(poId)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatch(/delivery note only/)
    expect((await bypassAudit(poId))[0]!.new_values.kind).toBe('direct_delivery')
  })

  it('rejects the declaration from anyone else, before recording the delivery', async () => {
    const { poId, lineId } = await jobsitePO()
    await expect(
      deliver(poId, lineId, 'company_admin', companyAdminId, {
        bypassPhotos: true,
        bypassReason: 'x',
      }),
    ).rejects.toThrow(/Only a system administrator/)
    const po = await pool.query<{ status: string }>(
      `SELECT status FROM purchase_orders WHERE id=$1`,
      [poId],
    )
    expect(po.rows[0]!.status).toBe('bought')
    expect(await bypassLog(poId)).toEqual([])
  })

  it('a normal delivery records no override', async () => {
    const { poId, lineId } = await jobsitePO()
    await deliver(poId, lineId, 'system_admin', adminId)
    expect(await bypassLog(poId)).toEqual([])
  })
})
