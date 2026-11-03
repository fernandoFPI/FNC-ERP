// Who may create an inter-company stock transfer (playbook #48).
//
// `createIntercoStockTransfer` used to check only that the caller was logged in: any user could send
// their own company's stock to any other company by calling it directly, although the permission
// `interco.stock_transfers.edit` existed and the page's New button only asked for `view`. It now
// needs that permission (admins pass, as everywhere else) and the right to act in the company the
// stock lands in.
//
// Real Postgres through the resolver, so the stock really moves (or really does not).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { invalidatePermissionCache } from '@fnc-erp/permissions'
import { resolvers } from '../src/graphql/resolvers.js'

const FROM_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const TO_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const EMAIL_PREFIX = 'interco-xfer-perm-test-'
const SKU_PREFIX = 'ICXPERM-'

type Who = 'sysadmin' | 'companyadmin' | 'editor' | 'editorBoth' | 'viewer' | 'plain'
const userIds = {} as Record<Who, string>
let productId: string
let fromWarehouseId: string
let fromVirtualInId: string
let toWarehouseId: string

function ctxFor(who: Who, role: string) {
  return {
    auth: {
      companyId: FROM_COMPANY_ID,
      userId: userIds[who],
      role,
      module: 'all',
      sessionId: 'interco-xfer-perm-test',
    },
  } as never
}

const input = (qty = 2) => ({
  input: {
    to_company_id: TO_COMPANY_ID,
    transfer_date: '2026-11-02',
    lines: [
      { product_id: productId, from_location_id: fromWarehouseId, to_location_id: toWarehouseId, qty },
    ],
  },
})

const create = (who: Who, role: string, qty = 2) =>
  resolvers.Mutation.createIntercoStockTransfer(null, input(qty), ctxFor(who, role))

async function qtyAt(locationId: string): Promise<number> {
  const r = await pool.query<{ qty_on_hand: string }>(
    `SELECT qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return parseFloat(r.rows[0]?.qty_on_hand ?? '0')
}

async function transferCount(): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM interco_stock_transfers WHERE initiated_by = ANY($1::uuid[])`,
    [Object.values(userIds)],
  )
  return parseInt(r.rows[0]!.n, 10)
}

async function cleanup(): Promise<void> {
  const users = `SELECT id FROM users WHERE email LIKE $1`
  await pool.query(
    `DELETE FROM interco_stock_transfer_lines WHERE transfer_id IN
       (SELECT id FROM interco_stock_transfers WHERE initiated_by IN (${users}))`,
    [`${EMAIL_PREFIX}%`],
  )
  await pool.query(`DELETE FROM interco_stock_transfers WHERE initiated_by IN (${users})`, [
    `${EMAIL_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [
    `${SKU_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [
    `${SKU_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (${users})`, [`${EMAIL_PREFIX}%`])
  await pool.query(`DELETE FROM user_company_roles WHERE user_id IN (${users})`, [`${EMAIL_PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  for (const who of ['sysadmin', 'companyadmin', 'editor', 'editorBoth', 'viewer', 'plain'] as const) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [`${EMAIL_PREFIX}${who}@fnc-erp.local`],
    )
    userIds[who] = r.rows[0]!.id
  }
  const grant = async (who: Who, level: string) => {
    await pool.query(
      `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level)
       VALUES ($1,$2,'interco.stock_transfers.edit',$3)
       ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level`,
      [userIds[who], FROM_COMPANY_ID, level],
    )
  }
  await grant('editor', 'edit')
  await grant('editorBoth', 'edit')
  await grant('viewer', 'view')
  // Only editorBoth can act in the company the stock lands in.
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'user','all')
     ON CONFLICT DO NOTHING`,
    [userIds.editorBoth, TO_COMPANY_ID],
  )
  for (const id of Object.values(userIds)) {
    await invalidatePermissionCache(id, FROM_COMPANY_ID)
    await invalidatePermissionCache(id, TO_COMPANY_ID)
  }

  const loc = async (companyId: string, type: string): Promise<string> => {
    const r = await pool.query<{ id: string }>(
      `SELECT id FROM stock_locations WHERE company_id=$1 AND type=$2 AND is_active=true LIMIT 1`,
      [companyId, type],
    )
    if (!r.rows[0]) throw new Error(`No ${type} location seeded for ${companyId} - run seeds first`)
    return r.rows[0].id
  }
  fromWarehouseId = await loc(FROM_COMPANY_ID, 'warehouse')
  fromVirtualInId = await loc(FROM_COMPANY_ID, 'virtual_in')
  toWarehouseId = await loc(TO_COMPANY_ID, 'warehouse')

  const p = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [FROM_COMPANY_ID, `${SKU_PREFIX}${Date.now()}`],
  )
  productId = p.rows[0]!.id
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),50,10,500,'po_receipt',$5)`,
    [FROM_COMPANY_ID, productId, fromVirtualInId, fromWarehouseId, userIds.sysadmin],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

describe('createIntercoStockTransfer - who may create one', () => {
  it('refuses a user with no inter-company permission, and moves nothing', async () => {
    const before = { from: await qtyAt(fromWarehouseId), to: await qtyAt(toWarehouseId), n: await transferCount() }

    await expect(create('plain', 'user')).rejects.toThrow(/Requires 'edit' access to 'interco.stock_transfers.edit'/)

    expect(await qtyAt(fromWarehouseId)).toBe(before.from)
    expect(await qtyAt(toWarehouseId)).toBe(before.to)
    expect(await transferCount()).toBe(before.n)
  })

  it('refuses a view-only user (they may read transfers, not create them), and moves nothing', async () => {
    const before = { from: await qtyAt(fromWarehouseId), n: await transferCount() }

    await expect(create('viewer', 'user')).rejects.toThrow(/Requires 'edit' access/)

    expect(await qtyAt(fromWarehouseId)).toBe(before.from)
    expect(await transferCount()).toBe(before.n)
  })

  it('refuses a user with edit permission who cannot act in the destination company, and moves nothing', async () => {
    const before = { from: await qtyAt(fromWarehouseId), n: await transferCount() }

    await expect(create('editor', 'user')).rejects.toThrow(
      'Destination company not found or not accessible to you',
    )

    expect(await qtyAt(fromWarehouseId)).toBe(before.from)
    expect(await transferCount()).toBe(before.n)
  })

  it('refuses a company admin who has no role in the destination company', async () => {
    await expect(create('companyadmin', 'company_admin')).rejects.toThrow(
      'Destination company not found or not accessible to you',
    )
  })

  it('lets a user with edit permission and a role in both companies create one: the stock really moves', async () => {
    const before = { from: await qtyAt(fromWarehouseId), to: await qtyAt(toWarehouseId) }

    const t = (await create('editorBoth', 'user', 3)) as { status: string; transferNumber: string }

    expect(t.status).toBe('posted')
    expect(await qtyAt(fromWarehouseId)).toBe(before.from - 3)
    expect(await qtyAt(toWarehouseId)).toBe(before.to + 3)
  })

  it('lets a system admin create one without any extra grant (admins reach every company)', async () => {
    const before = { from: await qtyAt(fromWarehouseId), to: await qtyAt(toWarehouseId) }

    const t = (await create('sysadmin', 'system_admin', 2)) as { status: string }

    expect(t.status).toBe('posted')
    expect(await qtyAt(fromWarehouseId)).toBe(before.from - 2)
    expect(await qtyAt(toWarehouseId)).toBe(before.to + 2)
  })
})
