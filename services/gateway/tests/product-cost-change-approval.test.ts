// Coverage for the cost-change approval gate: recordProductCostChange no
// longer writes products.standard_cost unconditionally once a change trips
// company_price_tolerance (same table/allowance formula the purchase-side
// over_tolerance check already uses) — it parks a product_cost_change_requests
// row instead, and only approveProductCostChange actually applies it.
// Real-Postgres pattern, same as product-cost-history.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const TEST_USER_EMAIL = 'cost-change-approval-test@fnc-erp.local'
const REVIEWER_USER_EMAIL = 'cost-change-approval-reviewer@fnc-erp.local'
const SKU_PREFIX = 'COSTAPPROVALTEST-'
const KEEPER_EMAIL = 'cost-change-approval-keeper@fnc-erp.local'
const SCOPED_KEEPER_EMAIL = 'cost-change-approval-scoped-keeper@fnc-erp.local'
const EMPLOYEE_PREFIX = 'COSTAPPROVALTEST-'

let userId: string
let reviewerId: string
let keeperId: string
let scopedKeeperId: string
let branchId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let reviewerCtx: {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
// Plain 'user' role holding the approve permission AND a company-wide Store Keeper position.
let keeperCtx: typeof reviewerCtx
// Same, but the Store Keeper position is scoped to one branch (does not count as company-wide).
let scopedKeeperCtx: typeof reviewerCtx
// The approve permission only: userId with a non-bypass role.
let ordinaryCtx: typeof reviewerCtx

// A non-admin user with the approve permission and a Store Keeper position.
async function makeKeeper(
  email: string,
  employeeNumber: string,
  branch: string | null,
): Promise<string> {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [email],
  )
  const id = u.rows[0]!.id
  await pool.query(
    `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level)
     VALUES ($1,$2,'inventory.products.approve_cost_change','edit')
     ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level='edit'`,
    [id, TEST_COMPANY_ID],
  )
  const e = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Test','Keeper',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, id, employeeNumber],
  )
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, branch_id, is_active, assigned_by)
     VALUES ($1,$2,'store_keeper',$3,true,$4)`,
    [TEST_COMPANY_ID, e.rows[0]!.id, branch, userId],
  )
  return id
}

const asUser = (id: string, role: string, session: string): typeof reviewerCtx => ({
  auth: { companyId: TEST_COMPANY_ID, userId: id, role, module: 'all', sessionId: session },
})

async function raiseChange(
  by: typeof reviewerCtx,
  suffix: string,
): Promise<{ productId: string; id: string }> {
  const productId = await makeProduct(suffix, 100, 'IQD')
  await resolvers.Mutation.updateProduct(
    null,
    { id: productId, input: { standard_cost: 150 } },
    by as never,
  )
  const pending = await getPendingRequest(productId)
  return { productId, id: pending!.id }
}

async function makeProduct(suffix: string, startingCost: number, currency = 'IQD'): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category, standard_cost, cost_currency)
     VALUES ($1,$2,$3,'unit','general',$4,$5) RETURNING id`,
    [TEST_COMPANY_ID, sku, sku, startingCost, currency],
  )
  return r.rows[0]!.id
}

async function getProductCost(productId: string): Promise<number> {
  const r = await pool.query<{ standard_cost: string }>(
    `SELECT standard_cost FROM products WHERE id=$1`,
    [productId],
  )
  return parseFloat(r.rows[0]!.standard_cost)
}

async function getPendingRequest(productId: string): Promise<{ id: string; status: string } | undefined> {
  const r = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM product_cost_change_requests WHERE product_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [productId],
  )
  return r.rows[0]
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM product_cost_change_requests WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    [`${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    [`${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [`${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = {
    auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'cost-approval-test' },
  }
  // Grants userId the real permission directly, same as a non-admin
  // store_keeper would hold in production — needed for the
  // "refuses self-approval for a non-admin" test, which reuses this same
  // user with role swapped to a plain, non-bypass role: without an actual
  // grant, requirePermGW would reject it on the permission check itself,
  // before ever reaching the self-approval rule this test is isolating.
  await pool.query(
    `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level)
     VALUES ($1,$2,'inventory.products.approve_cost_change','edit')
     ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level='edit'`,
    [userId, TEST_COMPANY_ID],
  )

  const reviewerR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [REVIEWER_USER_EMAIL],
  )
  reviewerId = reviewerR.rows[0]!.id
  reviewerCtx = {
    auth: {
      companyId: TEST_COMPANY_ID,
      userId: reviewerId,
      role: 'system_admin',
      module: 'all',
      sessionId: 'cost-approval-test-reviewer',
    },
  }

  // Deterministic tolerance for this suite regardless of what's already
  // seeded for the test company — same pattern requisition-items-bought.test.ts
  // already uses for the same reason (a fresh CI database has none at all).
  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'USD',5,20,true), ($1,'IQD',5,25000,true)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=EXCLUDED.tolerance_abs`,
    [TEST_COMPANY_ID],
  )

  await cleanup()
  await cleanupKeepers()

  branchId = (
    await pool.query<{ id: string }>(
      `INSERT INTO company_branches (company_id, name) VALUES ($1,'COSTAPPROVALTEST-BRANCH') RETURNING id`,
      [TEST_COMPANY_ID],
    )
  ).rows[0]!.id
  keeperId = await makeKeeper(KEEPER_EMAIL, `${EMPLOYEE_PREFIX}SK1`, null)
  scopedKeeperId = await makeKeeper(SCOPED_KEEPER_EMAIL, `${EMPLOYEE_PREFIX}SK2`, branchId)
  keeperCtx = asUser(keeperId, 'user', 'cost-approval-test-keeper')
  scopedKeeperCtx = asUser(scopedKeeperId, 'user', 'cost-approval-test-scoped-keeper')
  ordinaryCtx = asUser(userId, 'employee', 'cost-approval-test-ordinary')
})

async function cleanupKeepers(): Promise<void> {
  await pool.query(
    `DELETE FROM po_position_assignments WHERE employee_id IN (SELECT id FROM employees WHERE company_id=$1 AND employee_number LIKE $2)`,
    [TEST_COMPANY_ID, `${EMPLOYEE_PREFIX}%`],
  )
  await pool.query(`DELETE FROM employees WHERE company_id=$1 AND employee_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${EMPLOYEE_PREFIX}%`,
  ])
  await pool.query(
    `DELETE FROM company_branches WHERE company_id=$1 AND name='COSTAPPROVALTEST-BRANCH'`,
    [TEST_COMPANY_ID],
  )
  await pool.query(
    `DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email IN ($1,$2))`,
    [KEEPER_EMAIL, SCOPED_KEEPER_EMAIL],
  )
}

afterAll(async () => {
  await cleanup()
  await cleanupKeepers()
  await pool.query(`DELETE FROM users WHERE email IN ($1,$2,$3,$4)`, [
    TEST_USER_EMAIL,
    REVIEWER_USER_EMAIL,
    KEEPER_EMAIL,
    SCOPED_KEEPER_EMAIL,
  ])
  await pool.end()
})

describe('recordProductCostChange — tolerance gate', () => {
  it('applies a change within tolerance immediately, with no pending request', async () => {
    const productId = await makeProduct('within-tolerance', 100, 'IQD')
    // 100 -> 102 is 2%, well inside the seeded 5% allowance.
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 102 } },
      ctx as never,
    )
    expect(await getProductCost(productId)).toBe(102)
    expect(await getPendingRequest(productId)).toBeUndefined()
  })

  it('parks an over-tolerance change instead of applying it, and lists it in the queue', async () => {
    const productId = await makeProduct('over-tolerance', 100, 'IQD')
    // 100 -> 150 is 50%, well over the seeded 5%/flat allowance.
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 150 } },
      ctx as never,
    )
    expect(await getProductCost(productId)).toBe(100)
    const pending = await getPendingRequest(productId)
    expect(pending?.status).toBe('pending')

    const queue = (await resolvers.Query.productCostChangeRequests(
      null,
      { status: 'pending' },
      ctx as never,
    )) as { id: string; product_id: string; old_cost: string | null; new_cost: string }[]
    const row = queue.find((r) => r.product_id === productId)
    expect(row).toBeTruthy()
    expect(row!.old_cost).toBe('100.0000')
    expect(parseFloat(row!.new_cost)).toBe(150)
  })

  it('approving a pending change applies it and logs product_cost_history', async () => {
    const productId = await makeProduct('approve-flow', 100, 'IQD')
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 150 } },
      ctx as never,
    )
    const pending = await getPendingRequest(productId)

    const approved = (await resolvers.Mutation.approveProductCostChange(
      null,
      { id: pending!.id },
      reviewerCtx as never,
    )) as { status: string }
    expect(approved.status).toBe('approved')
    expect(await getProductCost(productId)).toBe(150)

    const history = await pool.query<{ old_cost: string; new_cost: string; source_type: string }>(
      `SELECT old_cost, new_cost, source_type FROM product_cost_history WHERE product_id=$1`,
      [productId],
    )
    expect(history.rows).toHaveLength(1)
    expect(history.rows[0]).toMatchObject({ old_cost: '100.0000', new_cost: '150.0000', source_type: 'manual_edit' })
  })

  it('rejecting a pending change leaves the cost untouched and records the reason', async () => {
    const productId = await makeProduct('reject-flow', 100, 'IQD')
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 150 } },
      ctx as never,
    )
    const pending = await getPendingRequest(productId)

    const rejected = (await resolvers.Mutation.rejectProductCostChange(
      null,
      { id: pending!.id, reason: 'Buyer confirmed this was a typo' },
      reviewerCtx as never,
    )) as { status: string }
    expect(rejected.status).toBe('rejected')
    expect(await getProductCost(productId)).toBe(100)

    const row = await pool.query<{ rejection_reason: string | null }>(
      `SELECT rejection_reason FROM product_cost_change_requests WHERE id=$1`,
      [pending!.id],
    )
    expect(row.rows[0]!.rejection_reason).toBe('Buyer confirmed this was a typo')

    const history = await pool.query(`SELECT 1 FROM product_cost_history WHERE product_id=$1`, [productId])
    expect(history.rows).toHaveLength(0)
  })

  it('refuses self-approval for a non-admin — whoever triggered the change cannot approve it themselves', async () => {
    const productId = await makeProduct('no-self-approve', 100, 'IQD')
    // A non-admin triggers it this time — updateProduct itself needs no
    // special permission in this test harness, so ctx's own role is swapped
    // for just the trigger, then restored; the approve attempt below uses a
    // plain employee role throughout.
    const nonAdminCtx = {
      auth: { ...ctx.auth, role: 'employee' },
    }
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 150 } },
      nonAdminCtx as never,
    )
    const pending = await getPendingRequest(productId)

    await expect(
      resolvers.Mutation.approveProductCostChange(null, { id: pending!.id }, nonAdminCtx as never),
    ).rejects.toThrow(/other than whoever triggered this change/i)
    expect(await getProductCost(productId)).toBe(100)
  })

  it('lets an admin approve their own triggered change — a single-admin company has no one else to ask', async () => {
    const productId = await makeProduct('admin-self-approve', 100, 'IQD')
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 150 } },
      ctx as never, // ctx itself is role: system_admin
    )
    const pending = await getPendingRequest(productId)

    const approved = (await resolvers.Mutation.approveProductCostChange(
      null,
      { id: pending!.id },
      ctx as never,
    )) as { status: string }
    expect(approved.status).toBe('approved')
    expect(await getProductCost(productId)).toBe(150)
  })

  it('refuses to review the same request twice', async () => {
    const productId = await makeProduct('no-double-review', 100, 'IQD')
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 150 } },
      ctx as never,
    )
    const pending = await getPendingRequest(productId)
    await resolvers.Mutation.approveProductCostChange(null, { id: pending!.id }, reviewerCtx as never)

    await expect(
      resolvers.Mutation.rejectProductCostChange(
        null,
        { id: pending!.id, reason: 'too late' },
        reviewerCtx as never,
      ),
    ).rejects.toThrow(/already been reviewed/i)
  })

  it('never flags a currency change on amount alone — no honest cross-currency comparison exists', async () => {
    const productId = await makeProduct('currency-change', 10, 'IQD')
    // 10 IQD -> 12 USD looks like a 20% jump numerically, but it's a
    // different currency entirely — must apply immediately, same as
    // recordLinePurchase's own over_tolerance guard for this exact case.
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 12, cost_currency: 'USD' } },
      ctx as never,
    )
    expect(await getProductCost(productId)).toBe(12)
    expect(await getPendingRequest(productId)).toBeUndefined()
  })

  it('never gates the first real cost on a never-costed product', async () => {
    const productId = await makeProduct('first-cost', 0, 'IQD')
    await resolvers.Mutation.updateProduct(
      null,
      { id: productId, input: { standard_cost: 500 } },
      ctx as never,
    )
    expect(await getProductCost(productId)).toBe(500)
    expect(await getPendingRequest(productId)).toBeUndefined()
  })
})

describe('who may clear a cost change they triggered themselves', () => {
  it('lets the company-wide Store Keeper approve their own change, and logs it under their name', async () => {
    const { productId, id } = await raiseChange(keeperCtx, 'keeper-approves-own')
    expect(await getProductCost(productId)).toBe(100)

    const approved = (await resolvers.Mutation.approveProductCostChange(
      null,
      { id },
      keeperCtx as never,
    )) as { status: string; reviewed_by: string; requested_by: string }
    expect(approved.status).toBe('approved')
    expect(approved.reviewed_by).toBe(keeperId)
    expect(approved.requested_by).toBe(keeperId)
    expect(await getProductCost(productId)).toBe(150)
  })

  it('lets the company-wide Store Keeper reject their own change', async () => {
    const { productId, id } = await raiseChange(keeperCtx, 'keeper-rejects-own')
    const rejected = (await resolvers.Mutation.rejectProductCostChange(
      null,
      { id, reason: 'Entered on the wrong product' },
      keeperCtx as never,
    )) as { status: string }
    expect(rejected.status).toBe('rejected')
    expect(await getProductCost(productId)).toBe(100)
  })

  it('does not extend that to a Store Keeper whose position is scoped to one branch', async () => {
    const { productId, id } = await raiseChange(scopedKeeperCtx, 'scoped-keeper')
    await expect(
      resolvers.Mutation.approveProductCostChange(null, { id }, scopedKeeperCtx as never),
    ).rejects.toThrow(/other than whoever triggered this change/i)
    await expect(
      resolvers.Mutation.rejectProductCostChange(null, { id, reason: 'x' }, scopedKeeperCtx as never),
    ).rejects.toThrow(/other than whoever triggered this change/i)
    expect(await getProductCost(productId)).toBe(100)
  })

  it('still needs a different reviewer for an approver who is not the Store Keeper (reject too)', async () => {
    const { id } = await raiseChange(ordinaryCtx, 'ordinary-reject')
    await expect(
      resolvers.Mutation.rejectProductCostChange(null, { id, reason: 'x' }, ordinaryCtx as never),
    ).rejects.toThrow(/other than whoever triggered this change/i)
  })

  it('lets the Store Keeper clear a change someone else raised, as before', async () => {
    const { productId, id } = await raiseChange(ordinaryCtx, 'keeper-clears-other')
    const approved = (await resolvers.Mutation.approveProductCostChange(
      null,
      { id },
      keeperCtx as never,
    )) as { status: string }
    expect(approved.status).toBe('approved')
    expect(await getProductCost(productId)).toBe(150)
  })
})

describe('productCostChangeRequests: can_review per caller', () => {
  interface QueueRow {
    id: string
    can_review: boolean | null
    requested_by: string
  }
  const queueFor = async (by: typeof reviewerCtx): Promise<QueueRow[]> =>
    (await resolvers.Query.productCostChangeRequests(
      null,
      { status: 'pending' },
      by as never,
    )) as QueueRow[]

  it('is false only for a request the caller raised and may not clear themselves', async () => {
    const mine = await raiseChange(ordinaryCtx, 'queue-ordinary')
    const keepers = await raiseChange(keeperCtx, 'queue-keeper')

    const asOrdinary = await queueFor(ordinaryCtx)
    expect(asOrdinary.find((r) => r.id === mine.id)?.can_review).toBe(false)
    expect(asOrdinary.find((r) => r.id === keepers.id)?.can_review).toBe(true)

    const asKeeper = await queueFor(keeperCtx)
    expect(asKeeper.find((r) => r.id === keepers.id)?.can_review).toBe(true) // own, but exempt
    expect(asKeeper.find((r) => r.id === mine.id)?.can_review).toBe(true)

    const asAdmin = await queueFor(reviewerCtx)
    expect(asAdmin.find((r) => r.id === mine.id)?.can_review).toBe(true)
    expect(asAdmin.find((r) => r.id === keepers.id)?.can_review).toBe(true)
  })

  it('agrees with what the mutations then accept', async () => {
    const own = await raiseChange(scopedKeeperCtx, 'queue-agrees')
    const row = (await queueFor(scopedKeeperCtx)).find((r) => r.id === own.id)
    expect(row?.can_review).toBe(false)
    await expect(
      resolvers.Mutation.approveProductCostChange(null, { id: own.id }, scopedKeeperCtx as never),
    ).rejects.toThrow(/other than whoever triggered this change/i)
  })

  it('returns the reviewer id so the page can tell a self-review apart', async () => {
    const own = await raiseChange(keeperCtx, 'queue-reviewer-id')
    await resolvers.Mutation.approveProductCostChange(null, { id: own.id }, keeperCtx as never)
    const done = (await resolvers.Query.productCostChangeRequests(
      null,
      { status: 'approved' },
      keeperCtx as never,
    )) as { id: string; reviewed_by: string; requested_by: string }[]
    const row = done.find((r) => r.id === own.id)
    expect(row?.reviewed_by).toBe(keeperId)
    expect(row?.requested_by).toBe(keeperId)
  })
})
