// An extra layer of approval on Items Bought (migration 316). An admin marks users whose purchases the requisition's
// organizer must approve; the requisition then stays in Items Bought, and Finish Buying waits, until the organizer (or
// an admin acting for him, never the buyer) approves, or sends a purchase back with a reason.
//
// Real Postgres, real mutations (createRequisition, setUserPurchaseReview, recordLinePurchase, approveItemsBought,
// sendBackPurchase, approveTolerancePurchase, finishBuyingRequisition, myRequisitionApprovalQueue) and the real schema
// for the reads; nothing mocked. One user per role: the organizer (a normal user, no positions), a marked buyer, an
// unmarked buyer, a PO admin, a stranger, two admins.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'purch-org-approval-'
const EMP_PREFIX = 'POA-EMP-'
const SKU_PREFIX = 'POATEST-'
const VENDOR_PREFIX = 'POATEST Vendor '

type Who = 'organizer' | 'buyerM' | 'buyerU' | 'poadmin' | 'stranger' | 'admin' | 'admin2'
const WHOS: Who[] = ['organizer', 'buyerM', 'buyerU', 'poadmin', 'stranger', 'admin', 'admin2']
const userIds = {} as Record<Who, string>
let vendorId: string
let toleranceBefore: { tolerance_pct: string; tolerance_abs: string; is_provisional: boolean } | null = null

const ctxFor = (who: Who, companyId = TEST_COMPANY_ID) =>
  ({
    auth: {
      companyId,
      userId: userIds[who],
      role: who === 'admin' || who === 'admin2' ? 'system_admin' : 'user',
      module: 'all',
      sessionId: 'poa-test',
    },
  }) as never

const server = new ApolloServer<ReturnType<typeof ctxFor>>({ typeDefs, resolvers })

async function makeUser(key: Who): Promise<void> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,'test-hash-not-used',$2,'Tester')
     ON CONFLICT (email) DO UPDATE SET first_name=EXCLUDED.first_name RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`, key],
  )
  userIds[key] = r.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'module_user','procurement')
     ON CONFLICT DO NOTHING`,
    [userIds[key], TEST_COMPANY_ID],
  )
}

async function givePosition(who: Who, position: string): Promise<void> {
  const emp = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,$3,'Tester',CURRENT_DATE,$4)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, userIds[who], who, `${EMP_PREFIX}${who}`],
  )
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, department_id, branch_id, is_active, assigned_by)
     VALUES ($1,$2,$3,NULL,NULL,true,$4)`,
    [TEST_COMPANY_ID, emp.rows[0]!.id, position, userIds.admin],
  )
}

interface LineSpec {
  qty?: number
  owner?: boolean
}
interface Req {
  reqId: string
  lines: string[]
}

// A requisition organized by the 'organizer' user, forced to `status`, with the given lines (each a catalog product,
// approved at 1,000 IQD so a purchase at 1,000 is within tolerance).
async function makeRequisition(status: string, specs: LineSpec[]): Promise<Req> {
  const lines: { product_id: string; description: string; qty: number; unit_price: number }[] = []
  for (const [i, s] of specs.entries()) {
    const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const prod = await pool.query<{ id: string }>(
      `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
      [TEST_COMPANY_ID, sku],
    )
    lines.push({ product_id: prod.rows[0]!.id, description: `Item ${i + 1}`, qty: s.qty ?? 10, unit_price: 1000 })
  }
  const created = (await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines } },
    { auth: { ...(ctxFor('organizer') as { auth: object }).auth, role: 'system_admin' } } as never,
  )) as { id: string }
  await pool.query(`UPDATE requisitions SET status=$1 WHERE id=$2`, [status, created.id])
  const rows = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`, [
    created.id,
  ])
  for (const [i, s] of specs.entries()) {
    await pool.query(`UPDATE po_lines SET owner_handles=$2, qty_from_stock=0, approved_unit_price=1000 WHERE id=$1`, [
      rows.rows[i]!.id,
      !!s.owner,
    ])
  }
  return { reqId: created.id, lines: rows.rows.map((r) => r.id) }
}

async function makeReceiptFile(): Promise<string> {
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userIds.organizer, `poa-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  return f.rows[0]!.id
}

const buy = async (who: Who, lineId: string, qty = 10, price = 1000, withReceipt = true) =>
  (await resolvers.Mutation.recordLinePurchase(
    null,
    {
      input: {
        lineId,
        vendorId,
        qty,
        actualUnitPrice: price,
        currencyCode: 'IQD',
        receiptFileId: withReceipt ? await makeReceiptFile() : undefined,
      },
    } as never,
    ctxFor(who),
  )) as { id: string }

const mark = (who: Who, target: Who, required = true) =>
  resolvers.Mutation.setUserPurchaseReview(null, { userId: userIds[target], required } as never, ctxFor(who))
const markedNow = async (target: Who) =>
  (await pool.query(`SELECT 1 FROM user_purchase_review_marks WHERE company_id=$1 AND user_id=$2`, [TEST_COMPANY_ID, userIds[target]]))
    .rows.length > 0
const approve = (who: Who, reqId: string, companyId = TEST_COMPANY_ID) =>
  resolvers.Mutation.approveItemsBought(null, { requisitionId: reqId } as never, ctxFor(who, companyId))
const sendBack = (who: Who, purchaseId: string, reason = 'wrong item') =>
  resolvers.Mutation.sendBackPurchase(null, { purchaseId, reason } as never, ctxFor(who))
const finishButton = (who: Who, reqId: string) =>
  resolvers.Mutation.finishBuyingRequisition(null, { id: reqId } as never, ctxFor(who))

const status = async (reqId: string): Promise<string> =>
  (await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])).rows[0]!.status
const purchaseRow = async (id: string) =>
  (
    await pool.query<{ needs_organizer_approval: boolean; organizer_approved_by: string | null; organizer_approved_at: string | null }>(
      `SELECT needs_organizer_approval, organizer_approved_by, organizer_approved_at FROM po_line_purchases WHERE id=$1`,
      [id],
    )
  ).rows[0]
const logActions = async (reqId: string): Promise<string[]> =>
  (await pool.query<{ action: string }>(`SELECT action FROM requisition_approval_log WHERE requisition_id=$1 ORDER BY created_at`, [reqId])).rows.map(
    (r) => r.action,
  )
const notices = async (type: string, reqId: string) =>
  (
    await pool.query<{ user_id: string; payload: Record<string, unknown> }>(
      `SELECT payload->>'userId' AS user_id, payload FROM service_outbox WHERE event_type=$1 AND payload->>'requisitionId'=$2`,
      [type, reqId],
    )
  ).rows

async function cleanup(): Promise<void> {
  const reqs = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`
  const a = [TEST_COMPANY_ID, `${EMAIL_PREFIX}%`]
  await pool.query(
    `DELETE FROM service_outbox WHERE event_type IN ('REQ_PURCHASES_APPROVAL_REQUIRED','REQ_PURCHASE_SENT_BACK') AND payload->>'requisitionId' IN (SELECT id::text FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2))`,
    a,
  )
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, a)
  await pool.query(`DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE requisition_id IN (${reqs}))`, a)
  await pool.query(
    `DELETE FROM document_attachments WHERE entity_type='po_line_purchase' AND uploaded_by IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`${EMAIL_PREFIX}%`],
  )
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE 'poa-test-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${reqs}))`, a)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, a)
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${reqs})`, a)
  await pool.query(`DELETE FROM requisitions WHERE id IN (${reqs})`, a)
  await pool.query(`DELETE FROM product_cost_change_requests WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [TEST_COMPANY_ID, `${VENDOR_PREFIX}%`])
  await pool.query(`DELETE FROM user_purchase_review_marks WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${EMAIL_PREFIX}%`])
  await pool.query(`DELETE FROM po_position_assignments WHERE employee_id IN (SELECT id FROM employees WHERE employee_number LIKE $1)`, [`${EMP_PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${EMP_PREFIX}%`])
}

beforeAll(async () => {
  for (const who of WHOS) await makeUser(who)
  await cleanup()
  await givePosition('buyerM', 'buyer')
  await givePosition('buyerU', 'buyer')
  await givePosition('poadmin', 'po_admin')
  vendorId = (
    await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
      TEST_COMPANY_ID,
      `${VENDOR_PREFIX}${Date.now()}`,
    ])
  ).rows[0]!.id
  toleranceBefore =
    (
      await pool.query(`SELECT tolerance_pct, tolerance_abs, is_provisional FROM company_price_tolerance WHERE company_id=$1 AND currency_code='IQD'`, [
        TEST_COMPANY_ID,
      ])
    ).rows[0] ?? null
  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'IQD',5,25000,true)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=25000`,
    [TEST_COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanup()
  if (toleranceBefore) {
    await pool.query(
      `UPDATE company_price_tolerance SET tolerance_pct=$2, tolerance_abs=$3, is_provisional=$4 WHERE company_id=$1 AND currency_code='IQD'`,
      [TEST_COMPANY_ID, toleranceBefore.tolerance_pct, toleranceBefore.tolerance_abs, toleranceBefore.is_provisional],
    )
  } else {
    await pool.query(`DELETE FROM company_price_tolerance WHERE company_id=$1 AND currency_code='IQD'`, [TEST_COMPANY_ID])
  }
  await pool.query(`DELETE FROM user_company_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${EMAIL_PREFIX}%`]).catch(() => undefined)
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]).catch(() => undefined)
  await pool.end()
})

describe('marking a user', () => {
  it('an admin marks and un-marks a user, and the mark can be read back', async () => {
    expect(await mark('admin', 'buyerM')).toBe(true)
    expect(await markedNow('buyerM')).toBe(true)
    expect(await resolvers.Query.userPurchaseReview(null, { userId: userIds.buyerM } as never, ctxFor('admin'))).toBe(true)
    await mark('admin', 'buyerM', false)
    expect(await markedNow('buyerM')).toBe(false)
    expect(await resolvers.Query.userPurchaseReview(null, { userId: userIds.buyerM } as never, ctxFor('admin'))).toBe(false)
  })

  it('works for a normal user with no position and no employee record, not only a procurement position holder', async () => {
    await mark('admin', 'stranger')
    expect(await markedNow('stranger')).toBe(true)
    await mark('admin', 'stranger', false)
  })

  it('marking twice leaves one row', async () => {
    await mark('admin', 'buyerM')
    await mark('admin', 'buyerM')
    const n = await pool.query(`SELECT COUNT(*)::int AS n FROM user_purchase_review_marks WHERE user_id=$1`, [userIds.buyerM])
    expect(n.rows[0].n).toBe(1)
    await mark('admin', 'buyerM', false)
  })

  it('a PO admin position holder can mark, like assigning positions', async () => {
    await mark('poadmin', 'buyerM')
    expect(await markedNow('buyerM')).toBe(true)
    await mark('poadmin', 'buyerM', false)
  })

  it.each(['stranger', 'buyerU', 'organizer'] as Who[])('%s cannot mark or read a mark', async (who) => {
    await expect(mark(who, 'buyerM')).rejects.toThrow(/system_admin role or PO Admin/)
    await expect(resolvers.Query.userPurchaseReview(null, { userId: userIds.buyerM } as never, ctxFor(who))).rejects.toThrow(
      /system_admin role or PO Admin/,
    )
    expect(await markedNow('buyerM')).toBe(false)
  })

  it('refuses a user who has no role in the company', async () => {
    const outsider = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,'x','Out','Sider')
       ON CONFLICT (email) DO UPDATE SET first_name='Out' RETURNING id`,
      [`${EMAIL_PREFIX}outsider@fnc-erp.local`],
    )
    await expect(
      resolvers.Mutation.setUserPurchaseReview(null, { userId: outsider.rows[0]!.id, required: true } as never, ctxFor('admin')),
    ).rejects.toThrow(/User not found in this company/)
    const n = await pool.query(`SELECT 1 FROM user_purchase_review_marks WHERE user_id=$1`, [outsider.rows[0]!.id])
    expect(n.rows).toHaveLength(0)
    await pool.query(`DELETE FROM users WHERE id=$1`, [outsider.rows[0]!.id])
  })

  describe('in a company other than the admin’s own', () => {
    // The Settings screen has a company switcher, so the mark must go to the company being shown, not silently to the
    // admin's session company; only a system admin reaches across companies.
    let otherCompanyId: string | null = null
    beforeAll(async () => {
      const other = await pool.query<{ id: string }>(`SELECT id FROM companies WHERE id <> $1 LIMIT 1`, [TEST_COMPANY_ID])
      otherCompanyId = other.rows[0]?.id ?? null
      if (otherCompanyId)
        await pool.query(
          `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'module_user','procurement')
           ON CONFLICT DO NOTHING`,
          [userIds.buyerU, otherCompanyId],
        )
    })
    const markIn = (who: Who, target: Who, companyId: string, required = true) =>
      resolvers.Mutation.setUserPurchaseReview(null, { userId: userIds[target], required, companyId } as never, ctxFor(who))
    const marksOf = async (target: Who) =>
      (
        await pool.query<{ company_id: string }>(`SELECT company_id FROM user_purchase_review_marks WHERE user_id=$1`, [userIds[target]])
      ).rows.map((r) => r.company_id)

    it('a system admin marks a user in the company being shown, and only there', async () => {
      if (!otherCompanyId) return
      await markIn('admin', 'buyerU', otherCompanyId)
      expect(await marksOf('buyerU')).toEqual([otherCompanyId])
      expect(await markedNow('buyerU')).toBe(false) // not in the admin's own company
      expect(
        await resolvers.Query.userPurchaseReview(null, { userId: userIds.buyerU, companyId: otherCompanyId } as never, ctxFor('admin')),
      ).toBe(true)
      expect(await resolvers.Query.userPurchaseReview(null, { userId: userIds.buyerU } as never, ctxFor('admin'))).toBe(false)
      await markIn('admin', 'buyerU', otherCompanyId, false)
      expect(await marksOf('buyerU')).toEqual([])
    })

    it('a PO admin of one company cannot mark or read in another', async () => {
      if (!otherCompanyId) return
      await expect(markIn('poadmin', 'buyerU', otherCompanyId)).rejects.toThrow(/system_admin role required to manage another company/)
      await expect(
        resolvers.Query.userPurchaseReview(null, { userId: userIds.buyerU, companyId: otherCompanyId } as never, ctxFor('poadmin')),
      ).rejects.toThrow(/system_admin role required to manage another company/)
      expect(await marksOf('buyerU')).toEqual([])
    })

    it('still checks that the user belongs to the company being shown', async () => {
      if (!otherCompanyId) return
      // buyerM has a role in the test company only
      await expect(markIn('admin', 'buyerM', otherCompanyId)).rejects.toThrow(/User not found in this company/)
    })
  })

  it('writes an audit row', async () => {
    await mark('admin', 'buyerM')
    await mark('admin', 'buyerM', false)
    const a = await pool.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE table_name='user_purchase_review_marks' AND record_id=$1 ORDER BY created_at DESC LIMIT 2`,
      [userIds.buyerM],
    )
    expect(a.rows.map((r) => r.action)).toEqual(['purchase_review_unmarked', 'purchase_review_marked'])
  })
})

describe('a purchase remembers whether its buyer was marked', () => {
  it('a marked buyer’s purchase needs the approval, an unmarked buyer’s does not', async () => {
    const r = await makeRequisition('items_bought', [{}, {}])
    await mark('admin', 'buyerM')
    const marked = await buy('buyerM', r.lines[0]!)
    const plain = await buy('buyerU', r.lines[1]!)
    expect((await purchaseRow(marked.id))!.needs_organizer_approval).toBe(true)
    expect((await purchaseRow(plain.id))!.needs_organizer_approval).toBe(false)
    await mark('admin', 'buyerM', false)
  })

  it('marking someone after a purchase does not trap it, and un-marking does not free it', async () => {
    const r = await makeRequisition('items_bought', [{}, {}])
    const before = await buy('buyerM', r.lines[0]!, 4) // not marked yet
    await mark('admin', 'buyerM')
    const after = await buy('buyerM', r.lines[0]!, 6)
    await mark('admin', 'buyerM', false)
    expect((await purchaseRow(before.id))!.needs_organizer_approval).toBe(false)
    expect((await purchaseRow(after.id))!.needs_organizer_approval).toBe(true) // still pending after the un-mark
  })
})

describe('the requisition waits for the organizer', () => {
  it('stays in Items Bought after the last purchase, and the button refuses with the reason', async () => {
    const r = await makeRequisition('items_bought', [{}, {}])
    await mark('admin', 'buyerM')
    await buy('buyerM', r.lines[0]!)
    await buy('buyerM', r.lines[1]!)
    expect(await status(r.reqId)).toBe('items_bought')
    await expect(finishButton('admin', r.reqId)).rejects.toThrow(/must be approved by the requisition's organizer/)
    expect(await status(r.reqId)).toBe('items_bought')
    await mark('admin', 'buyerM', false)
  })

  it('an unmarked buyer’s requisition still finishes by itself, as before', async () => {
    const r = await makeRequisition('items_bought', [{}, {}])
    await buy('buyerU', r.lines[0]!)
    await buy('buyerU', r.lines[1]!)
    expect(await status(r.reqId)).toBe('sourcing')
  })

  it('one marked buyer’s purchase among unmarked ones is enough to wait', async () => {
    const r = await makeRequisition('items_bought', [{}, {}])
    await mark('admin', 'buyerM')
    await buy('buyerU', r.lines[0]!)
    await buy('buyerM', r.lines[1]!)
    expect(await status(r.reqId)).toBe('items_bought')
    await mark('admin', 'buyerM', false)
  })

  it('also waits for an over-tolerance sign-off, in either order', async () => {
    const r = await makeRequisition('items_bought', [{}])
    await mark('admin', 'buyerM')
    const over = await buy('buyerM', r.lines[0]!, 10, 1300) // 1,000 approved + 5 % = 1,050 ceiling
    await approve('organizer', r.reqId)
    expect(await status(r.reqId)).toBe('items_bought') // the tolerance override is still open
    await resolvers.Mutation.approveTolerancePurchase(null, { purchaseId: over.id } as never, ctxFor('admin'))
    expect(await status(r.reqId)).toBe('sourcing')

    const r2 = await makeRequisition('items_bought', [{}])
    const over2 = await buy('buyerM', r2.lines[0]!, 10, 1300)
    await resolvers.Mutation.approveTolerancePurchase(null, { purchaseId: over2.id } as never, ctxFor('admin'))
    expect(await status(r2.reqId)).toBe('items_bought') // now the organizer's approval is missing
    await approve('organizer', r2.reqId)
    expect(await status(r2.reqId)).toBe('sourcing')
    await mark('admin', 'buyerM', false)
  })
})

describe('approving the items bought', () => {
  async function waiting(extra: LineSpec[] = [{}, {}]) {
    const r = await makeRequisition('items_bought', extra)
    await mark('admin', 'buyerM')
    const purchases: { id: string }[] = []
    for (const line of r.lines) purchases.push(await buy('buyerM', line))
    return { ...r, purchases }
  }
  const unmarkAll = async () => {
    for (const w of ['buyerM', 'organizer', 'admin2'] as Who[]) await mark('admin', w, false)
  }

  it('the organizer approves, the requisition finishes by itself, and the approval is recorded', async () => {
    const r = await waiting()
    expect(await status(r.reqId)).toBe('items_bought')
    await approve('organizer', r.reqId)
    expect(await status(r.reqId)).toBe('sourcing')
    for (const p of r.purchases) {
      const row = (await purchaseRow(p.id))!
      expect(row.organizer_approved_by).toBe(userIds.organizer)
      expect(row.organizer_approved_at).not.toBeNull()
    }
    expect(await logActions(r.reqId)).toContain('items_bought_approved')
    await unmarkAll()
  })

  it('an admin can approve for him', async () => {
    const r = await waiting([{}])
    await approve('admin', r.reqId)
    expect(await status(r.reqId)).toBe('sourcing')
    expect((await purchaseRow(r.purchases[0]!.id))!.organizer_approved_by).toBe(userIds.admin)
    await unmarkAll()
  })

  it.each(['buyerM', 'buyerU', 'stranger', 'poadmin'] as Who[])('%s cannot approve', async (who) => {
    const r = await waiting([{}])
    await expect(approve(who, r.reqId)).rejects.toThrow(/Only the requisition's organizer, or an admin/)
    expect(await status(r.reqId)).toBe('items_bought')
    expect((await purchaseRow(r.purchases[0]!.id))!.organizer_approved_by).toBeNull()
    await unmarkAll()
  })

  it('has nothing to approve when nothing is waiting', async () => {
    const r = await makeRequisition('items_bought', [{}])
    await buy('buyerU', r.lines[0]!, 4) // part-bought, unmarked
    await expect(approve('organizer', r.reqId)).rejects.toThrow(/No purchases are waiting for approval/)
  })

  it('cannot approve once the requisition has left Items Bought, and a second approval finds nothing', async () => {
    const r = await waiting([{}])
    await approve('organizer', r.reqId)
    await expect(approve('organizer', r.reqId)).rejects.toThrow(/must be in items_bought status/)
    await unmarkAll()
  })

  it('another company’s caller does not even find the requisition', async () => {
    const other = await pool.query<{ id: string }>(`SELECT id FROM companies WHERE id <> $1 LIMIT 1`, [TEST_COMPANY_ID])
    if (!other.rows[0]) return
    const r = await waiting([{}])
    await expect(approve('admin', r.reqId, other.rows[0].id)).rejects.toThrow(/Requisition not found/)
    expect(await status(r.reqId)).toBe('items_bought')
    await unmarkAll()
  })

  it('when the buyer is the organizer himself, he cannot approve his own: only an admin can', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    await mark('admin', 'organizer')
    const own = await buy('organizer', r.lines[0]!)
    expect((await purchaseRow(own.id))!.needs_organizer_approval).toBe(true)
    expect(await status(r.reqId)).toBe('items_bought')
    await expect(approve('organizer', r.reqId)).rejects.toThrow(/Only the requisition's organizer, or an admin/)
    await expect(approve('buyerU', r.reqId)).rejects.toThrow(/Only the requisition's organizer, or an admin/)
    await approve('admin', r.reqId)
    expect(await status(r.reqId)).toBe('sourcing')
    await unmarkAll()
  })

  it('an admin who is a marked buyer cannot approve his own purchase; another admin can', async () => {
    const r = await makeRequisition('items_bought', [{}])
    await mark('admin', 'admin2')
    await buy('admin2', r.lines[0]!)
    expect(await status(r.reqId)).toBe('items_bought')
    await expect(approve('admin2', r.reqId)).rejects.toThrow(/Only the requisition's organizer, or an admin/)
    await approve('admin', r.reqId)
    expect(await status(r.reqId)).toBe('sourcing')
    await unmarkAll()
  })

  it('approves only what the caller may: his own purchase stays for an admin, the requisition waits for it', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    await mark('admin', 'organizer')
    await mark('admin', 'buyerM')
    const own = await buy('organizer', r.lines[0]!)
    const theirs = await buy('buyerM', r.lines[1]!)
    await approve('organizer', r.reqId)
    expect((await purchaseRow(theirs.id))!.organizer_approved_by).toBe(userIds.organizer)
    expect((await purchaseRow(own.id))!.organizer_approved_by).toBeNull()
    expect(await status(r.reqId)).toBe('items_bought')
    await approve('admin', r.reqId)
    expect(await status(r.reqId)).toBe('sourcing')
    await unmarkAll()
  })
})

describe('sending a purchase back', () => {
  async function waiting() {
    const r = await makeRequisition('items_bought', [{}, {}])
    await mark('admin', 'buyerM')
    const first = await buy('buyerM', r.lines[0]!)
    const second = await buy('buyerM', r.lines[1]!)
    return { ...r, first, second }
  }
  const unmark = () => mark('admin', 'buyerM', false)

  it('removes the purchase and its receipt, reopens the line, logs the reason and tells the buyer', async () => {
    const r = await waiting()
    expect(await sendBack('organizer', r.first.id, 'wrong brand of cement')).toBe(true)
    expect(await purchaseRow(r.first.id)).toBeUndefined()
    const att = await pool.query(`SELECT 1 FROM document_attachments WHERE entity_type='po_line_purchase' AND entity_id=$1`, [r.first.id])
    expect(att.rows).toHaveLength(0)
    expect(await status(r.reqId)).toBe('items_bought')
    expect(await purchaseRow(r.second.id)).toBeDefined() // the other purchase is untouched
    const log = await pool.query(
      `SELECT notes FROM requisition_approval_log WHERE requisition_id=$1 AND action='purchase_sent_back'`,
      [r.reqId],
    )
    expect(log.rows.map((x) => x.notes)).toEqual(['wrong brand of cement'])
    const told = await notices('REQ_PURCHASE_SENT_BACK', r.reqId)
    expect(told).toHaveLength(1)
    expect(told[0]!.user_id).toBe(userIds.buyerM)
    expect(String(told[0]!.payload.body)).toContain('wrong brand of cement')
    await unmark()
  })

  it('the line can be bought again, and the new purchase needs the approval again', async () => {
    const r = await waiting()
    await sendBack('organizer', r.first.id)
    await mark('admin', 'buyerM') // still marked
    const again = await buy('buyerM', r.lines[0]!)
    expect((await purchaseRow(again.id))!.needs_organizer_approval).toBe(true)
    await approve('organizer', r.reqId)
    expect(await status(r.reqId)).toBe('sourcing')
    await unmark()
  })

  it('needs a reason', async () => {
    const r = await waiting()
    await expect(sendBack('organizer', r.first.id, '   ')).rejects.toThrow(/reason is required/)
    expect(await purchaseRow(r.first.id)).toBeDefined()
    await unmark()
  })

  it('an admin can send it back; the buyer, a stranger and another buyer cannot', async () => {
    const r = await waiting()
    for (const who of ['buyerM', 'stranger', 'buyerU'] as Who[])
      await expect(sendBack(who, r.first.id)).rejects.toThrow(/Only the requisition's organizer, or an admin/)
    expect(await purchaseRow(r.first.id)).toBeDefined()
    await sendBack('admin', r.first.id)
    expect(await purchaseRow(r.first.id)).toBeUndefined()
    await unmark()
  })

  it('cannot send back a purchase that is already approved, or one that never needed approval', async () => {
    const r = await waiting()
    await approve('organizer', r.reqId)
    await expect(sendBack('organizer', r.first.id)).rejects.toThrow(/must be in items_bought status|not waiting for approval/)

    const r2 = await makeRequisition('items_bought', [{}, {}])
    const plain = await buy('buyerU', r2.lines[0]!)
    await expect(sendBack('organizer', plain.id)).rejects.toThrow(/not waiting for approval/)
    expect(await purchaseRow(plain.id)).toBeDefined()
    await unmark()
  })

  it('cannot send back a purchase on a requisition that is no longer in Items Bought (e.g. cancelled)', async () => {
    const r = await waiting()
    await pool.query(`UPDATE requisitions SET status='cancelled' WHERE id=$1`, [r.reqId])
    await expect(sendBack('organizer', r.first.id)).rejects.toThrow(/must be in items_bought status to send a purchase back/)
    expect(await purchaseRow(r.first.id)).toBeDefined()
    await unmark()
  })

  it('cannot send back another company’s purchase', async () => {
    const other = await pool.query<{ id: string }>(`SELECT id FROM companies WHERE id <> $1 LIMIT 1`, [TEST_COMPANY_ID])
    if (!other.rows[0]) return
    const r = await waiting()
    await expect(
      resolvers.Mutation.sendBackPurchase(null, { purchaseId: r.first.id, reason: 'x' } as never, ctxFor('admin', other.rows[0].id)),
    ).rejects.toThrow(/Purchase entry not found/)
    expect(await purchaseRow(r.first.id)).toBeDefined()
    await unmark()
  })
})

describe('what the screens read', () => {
  const read = async (who: Who, reqId: string) => {
    const res = await server.executeOperation(
      {
        query: `query ($id: ID!) {
          requisition(id: $id) {
            lines { purchases { id bought_by needs_organizer_approval organizer_approved_by organizer_approved_by_name caller_can_approve } }
          }
        }`,
        variables: { id: reqId },
      },
      { contextValue: ctxFor(who) },
    )
    if (res.body.kind !== 'single') throw new Error('unexpected response kind')
    const { data, errors } = res.body.singleResult
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
    type P = {
      id: string
      needs_organizer_approval: boolean | null
      organizer_approved_by: string | null
      organizer_approved_by_name: string | null
      caller_can_approve: boolean | null
    }
    return (data as { requisition: { lines: { purchases: P[] }[] } }).requisition.lines.flatMap((l) => l.purchases)
  }

  it('tells each caller whether he may approve, decided on the server', async () => {
    const r = await makeRequisition('items_bought', [{}])
    await mark('admin', 'buyerM')
    await buy('buyerM', r.lines[0]!)
    const can = async (who: Who) => (await read(who, r.reqId))[0]!.caller_can_approve
    expect(await can('organizer')).toBe(true)
    expect(await can('admin')).toBe(true)
    expect(await can('buyerM')).toBe(false)
    expect(await can('buyerU')).toBe(false)
    expect(await can('stranger')).toBe(false)
    await mark('admin', 'buyerM', false)
  })

  it('after the approval it says who approved and nobody can act on it any more', async () => {
    const r = await makeRequisition('items_bought', [{}, {}])
    await mark('admin', 'buyerM')
    await buy('buyerM', r.lines[0]!)
    await buy('buyerU', r.lines[1]!, 4) // keeps the requisition in Items Bought
    await approve('organizer', r.reqId)
    const purchases = await read('organizer', r.reqId)
    const marked = purchases.find((p) => p.needs_organizer_approval)!
    expect(marked.organizer_approved_by_name).toBe('organizer Tester')
    expect(marked.caller_can_approve).toBe(false)
    const plain = purchases.find((p) => !p.needs_organizer_approval)!
    expect(plain.caller_can_approve).toBe(false)
    await mark('admin', 'buyerM', false)
  })

  it('the organizer finds the requisition in his queue while purchases wait for him, and not after', async () => {
    const r = await makeRequisition('items_bought', [{}])
    const queue = async (who: Who) =>
      ((await resolvers.Query.myRequisitionApprovalQueue(null, {} as never, ctxFor(who))) as { id: string }[]).map((x) => x.id)
    expect(await queue('organizer')).not.toContain(r.reqId) // nothing bought yet
    await mark('admin', 'buyerM')
    await buy('buyerM', r.lines[0]!)
    expect(await queue('organizer')).toContain(r.reqId)
    expect(await queue('stranger')).not.toContain(r.reqId)
    await approve('organizer', r.reqId)
    expect(await queue('organizer')).not.toContain(r.reqId)
    await mark('admin', 'buyerM', false)
  })

  it('does not queue it for the organizer when the only purchases waiting are his own', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    await mark('admin', 'organizer')
    await buy('organizer', r.lines[0]!)
    const ids = ((await resolvers.Query.myRequisitionApprovalQueue(null, {} as never, ctxFor('organizer'))) as { id: string }[]).map((x) => x.id)
    expect(ids).not.toContain(r.reqId)
    const adminIds = ((await resolvers.Query.myRequisitionApprovalQueue(null, {} as never, ctxFor('admin'))) as { id: string }[]).map((x) => x.id)
    expect(adminIds).toContain(r.reqId)
    await mark('admin', 'organizer', false)
  })
})

describe('telling the organizer', () => {
  it('asks once, when the last thing the requisition was waiting for is the organizer', async () => {
    const r = await makeRequisition('items_bought', [{}, {}])
    await mark('admin', 'buyerM')
    await buy('buyerM', r.lines[0]!)
    expect(await notices('REQ_PURCHASES_APPROVAL_REQUIRED', r.reqId)).toHaveLength(0) // line 2 still to buy
    await buy('buyerM', r.lines[1]!, 10, 1000, false) // no receipt yet: still waiting for the receipt, not the organizer
    expect(await notices('REQ_PURCHASES_APPROVAL_REQUIRED', r.reqId)).toHaveLength(0)

    const pending = await pool.query<{ id: string }>(
      `SELECT plp.id FROM po_line_purchases plp WHERE plp.po_line_id=$1`,
      [r.lines[1]],
    )
    await resolvers.Mutation.attachFile(
      null,
      { fileId: await makeReceiptFile(), entityType: 'po_line_purchase', entityId: pending.rows[0]!.id } as never,
      ctxFor('buyerM'),
    )
    const told = await notices('REQ_PURCHASES_APPROVAL_REQUIRED', r.reqId)
    expect(told).toHaveLength(1)
    expect(told[0]!.user_id).toBe(userIds.organizer)
    // the payload carries the key the worker reads for every REQ_* event
    expect(told[0]!.payload.requisitionId).toBe(r.reqId)

    // another photo on the same purchase re-runs the check; he is not asked again
    await resolvers.Mutation.attachFile(
      null,
      { fileId: await makeReceiptFile(), entityType: 'po_line_purchase', entityId: pending.rows[0]!.id } as never,
      ctxFor('buyerM'),
    )
    expect(await notices('REQ_PURCHASES_APPROVAL_REQUIRED', r.reqId)).toHaveLength(1)
    await mark('admin', 'buyerM', false)
  })

  it('does not ask him to approve purchases that are his own', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    await mark('admin', 'organizer')
    await buy('organizer', r.lines[0]!)
    expect(await notices('REQ_PURCHASES_APPROVAL_REQUIRED', r.reqId)).toHaveLength(0)
    await mark('admin', 'organizer', false)
  })

  it('does not ask when nothing needs the approval', async () => {
    const r = await makeRequisition('items_bought', [{}])
    await buy('buyerU', r.lines[0]!)
    expect(await notices('REQ_PURCHASES_APPROVAL_REQUIRED', r.reqId)).toHaveLength(0)
  })
})
