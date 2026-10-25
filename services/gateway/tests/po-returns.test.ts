// Coverage for vendor returns (po_returns), ported from the deleted
// services/procurement REST route into the gateway's GraphQL. Real-Postgres
// pattern, same as add-po-log-note.test.ts: nothing mocked, so the quantity
// rules, the generated line_total / total trigger and the numbering run for real.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const OTHER_COMPANY_ID = '00000000-0000-0000-0000-0000000000f9'
const EMAIL_PREFIX = 'po-returns-test-'
const PO_PREFIX = 'RTNTEST-PO-'
const EMP_PREFIX = 'RTNTEST-EMP-'

type Role = 'editor' | 'approver' | 'finance' | 'plain'
const userIds = {} as Record<Role, string>
let adminId: string

function ctxFor(userId: string, role = 'user', companyId = TEST_COMPANY_ID) {
  return { auth: { companyId, userId, role, module: 'all', sessionId: 'po-returns-test' } } as never
}
const admin = () => ctxFor(adminId, 'company_admin')

interface ReturnShape {
  id: string
  return_number: string
  return_type: string
  status: string
  currency_code: string
  total_returned_value: string
  responsible_employee_id: string | null
  deduction_request_id: string | null
  credit_note_reference: string | null
  items: {
    po_line_id: string
    quantity_returned: string
    original_unit_price: string
    assessed_unit_price: string
    line_total: string
  }[]
}

async function makePO(status: string): Promise<{ poId: string; poNumber: string }> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, organizer_id, status, currency_code, base_currency_code, purpose)
     VALUES ($1,$2,$3,$3,$4,'IQD','IQD','stock') RETURNING id`,
    [TEST_COMPANY_ID, poNumber, adminId, status],
  )
  return { poId: r.rows[0]!.id, poNumber }
}

async function makeLine(
  poId: string,
  n: number,
  opts: { ordered?: number; received?: number; price?: number; currency?: string } = {},
): Promise<string> {
  const ordered = opts.ordered ?? 10
  const price = opts.price ?? 100
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, qty_received, unit_price, currency_code, total_price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [poId, n, `line ${n}`, ordered, opts.received ?? ordered, price, opts.currency ?? 'IQD', ordered * price],
  )
  return r.rows[0]!.id
}

async function makeEmployee(status = 'active'): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number, status)
     VALUES ($1,'Rtn','Tester',CURRENT_DATE,$2,$3) RETURNING id`,
    [TEST_COMPANY_ID, `${EMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, status],
  )
  return r.rows[0]!.id
}

function createInput(
  lines: { id: string; qty: number; assessed?: number; notes?: string }[],
  over: Record<string, unknown> = {},
) {
  return {
    return_type: 'full_refund',
    items: lines.map((l) => ({
      po_line_id: l.id,
      description: 'Returned item',
      quantity_returned: l.qty,
      assessed_unit_price: l.assessed,
      damage_notes: l.notes,
    })),
    ...over,
  }
}

async function create(poId: string, input: ReturnType<typeof createInput>, ctx = admin()) {
  return (await resolvers.Mutation.createPOReturn(null, { poId, input } as never, ctx)) as ReturnShape
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM salary_deduction_requests WHERE source_type='po_return'
       AND source_id IN (SELECT r.id FROM po_returns r JOIN purchase_orders p ON p.id=r.po_id WHERE p.po_number LIKE $1)`,
    [`${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_returns WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`,
    [`${PO_PREFIX}%`],
  )
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM employees WHERE company_id=$1 AND employee_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${EMP_PREFIX}%`,
  ])
}

beforeAll(async () => {
  const grants: Record<Role, [string, string][]> = {
    editor: [['procurement.po.edit', 'edit']],
    approver: [['procurement.po.approve', 'approve']],
    finance: [['finance.ap.edit', 'edit']],
    plain: [],
  }
  for (const key of ['admin', 'editor', 'approver', 'finance', 'plain'] as const) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [`${EMAIL_PREFIX}${key}@fnc-erp.local`],
    )
    if (key === 'admin') adminId = r.rows[0]!.id
    else {
      userIds[key] = r.rows[0]!.id
      for (const [perm, level] of grants[key]) {
        await pool.query(
          `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level`,
          [r.rows[0]!.id, TEST_COMPANY_ID, perm, level],
        )
      }
    }
  }
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [
    `${EMAIL_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

describe('createPOReturn', () => {
  it('creates a full-refund return priced from the PO line, ignoring any client price', async () => {
    const { poId, poNumber } = await makePO('goods_received')
    const line = await makeLine(poId, 1, { ordered: 10, received: 10, price: 250 })

    // A client-supplied assessed price must not matter for a full refund.
    const ret = await create(poId, createInput([{ id: line, qty: 4, assessed: 1 }]))

    expect(ret.status).toBe('draft')
    expect(ret.return_type).toBe('full_refund')
    expect(ret.return_number).toBe(`RTN-${poNumber.replace(/^PO-/i, '')}`)
    expect(ret.currency_code.trim()).toBe('IQD')
    expect(ret.items).toHaveLength(1)
    expect(parseFloat(ret.items[0]!.original_unit_price)).toBe(250)
    expect(parseFloat(ret.items[0]!.assessed_unit_price)).toBe(250)
    expect(parseFloat(ret.items[0]!.line_total)).toBe(1000)
    // total_returned_value is kept by the sync_po_return_total trigger
    expect(parseFloat(ret.total_returned_value)).toBe(1000)
  })

  it('creates a damage return at the assessed price and records the damage notes', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1, { price: 100 })

    const ret = await create(
      poId,
      createInput([{ id: line, qty: 3, assessed: 40, notes: 'cracked casing' }], {
        return_type: 'damage',
        damage_description: 'Arrived crushed',
      }),
    )

    expect(ret.return_type).toBe('damage')
    expect(parseFloat(ret.items[0]!.original_unit_price)).toBe(100)
    expect(parseFloat(ret.items[0]!.assessed_unit_price)).toBe(40)
    expect(parseFloat(ret.total_returned_value)).toBe(120)
    const row = await pool.query(`SELECT damage_description FROM po_returns WHERE id=$1`, [ret.id])
    expect(row.rows[0].damage_description).toBe('Arrived crushed')
  })

  it.each(['goods_received', 'invoiced', 'completed', 'payment_pending', 'closed'])(
    'accepts a PO in %s',
    async (status) => {
      const { poId } = await makePO(status)
      const line = await makeLine(poId, 1)
      const ret = await create(poId, createInput([{ id: line, qty: 1 }]))
      expect(ret.status).toBe('draft')
    },
  )

  it.each(['approved', 'items_bought', 'bought', 'finance_audit', 'finance_review', 'cancelled'])(
    'rejects a PO in %s',
    async (status) => {
      const { poId } = await makePO(status)
      const line = await makeLine(poId, 1)
      await expect(create(poId, createInput([{ id: line, qty: 1 }]))).rejects.toThrow(
        /Returns can only be created once goods are received/,
      )
      const n = await pool.query(`SELECT 1 FROM po_returns WHERE po_id=$1`, [poId])
      expect(n.rows.length).toBe(0)
    },
  )

  it('rejects a quantity above what was received', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1, { ordered: 10, received: 6 })
    await expect(create(poId, createInput([{ id: line, qty: 7 }]))).rejects.toThrow(
      /exceeds the quantity received \(6 available\)/,
    )
    // exactly the received quantity is fine
    await expect(create(poId, createInput([{ id: line, qty: 6 }]))).resolves.toBeTruthy()
  })

  it('counts only non-draft returns against the received quantity', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1, { received: 10 })
    const first = await create(poId, createInput([{ id: line, qty: 8 }]))
    // A draft reserves nothing, so a second draft for the same units is accepted…
    const second = await create(poId, createInput([{ id: line, qty: 8 }]))

    // …but once the first is submitted it counts, and the second can no longer be submitted.
    await resolvers.Mutation.submitPOReturn(null, { id: first.id } as never, admin())
    await expect(resolvers.Mutation.submitPOReturn(null, { id: second.id } as never, admin())).rejects.toThrow(
      /exceeds the quantity received \(2 available\)/,
    )
    const st = await pool.query(`SELECT status::text AS status FROM po_returns WHERE id=$1`, [second.id])
    expect(st.rows[0].status).toBe('draft')
  })

  it('rejects a line that belongs to another PO', async () => {
    const a = await makePO('goods_received')
    const b = await makePO('goods_received')
    const lineOfB = await makeLine(b.poId, 1)
    await expect(create(a.poId, createInput([{ id: lineOfB, qty: 1 }]))).rejects.toThrow(
      /not lines of this purchase order/,
    )
  })

  it('rejects lines priced in different currencies', async () => {
    const { poId } = await makePO('goods_received')
    const iqd = await makeLine(poId, 1, { currency: 'IQD' })
    const usd = await makeLine(poId, 2, { currency: 'USD' })
    await expect(
      create(
        poId,
        createInput([
          { id: iqd, qty: 1 },
          { id: usd, qty: 1 },
        ]),
      ),
    ).rejects.toThrow(/different currencies/)
  })

  it("uses the line's own currency for the return", async () => {
    const { poId } = await makePO('goods_received')
    const usd = await makeLine(poId, 1, { currency: 'USD', price: 5 })
    const ret = await create(poId, createInput([{ id: usd, qty: 2 }]))
    expect(ret.currency_code.trim()).toBe('USD')
    expect(parseFloat(ret.total_returned_value)).toBe(10)
  })

  it('validates the input', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1, { price: 100 })
    const damage = { return_type: 'damage', damage_description: 'broken' }

    await expect(create(poId, createInput([]))).rejects.toThrow(/At least one item/)
    await expect(create(poId, createInput([{ id: line, qty: 0 }]))).rejects.toThrow(/valid quantity/)
    await expect(create(poId, createInput([{ id: line, qty: -2 }]))).rejects.toThrow(/valid quantity/)
    await expect(
      create(poId, createInput([{ id: line, qty: 1, assessed: 10 }], { return_type: 'damage' })),
    ).rejects.toThrow(/Damage description is required/)
    await expect(create(poId, createInput([{ id: line, qty: 1 }], damage))).rejects.toThrow(/assessed price/)
    await expect(create(poId, createInput([{ id: line, qty: 1, assessed: 101 }], damage))).rejects.toThrow(
      /cannot exceed the original price/,
    )
    await expect(
      create(poId, createInput([{ id: line, qty: 1 }], { return_type: 'something_else' })),
    ).rejects.toThrow(/return_type must be/)
    // an assessed price equal to the original is allowed
    await expect(create(poId, createInput([{ id: line, qty: 1, assessed: 100 }], damage))).resolves.toBeTruthy()
  })

  it('numbers later returns on the same PO -1, -2 and does not reuse a number after a delete', async () => {
    const { poId, poNumber } = await makePO('goods_received')
    const line = await makeLine(poId, 1, { received: 10 })
    const base = `RTN-${poNumber.replace(/^PO-/i, '')}`

    const r0 = await create(poId, createInput([{ id: line, qty: 1 }]))
    const r1 = await create(poId, createInput([{ id: line, qty: 1 }]))
    const r2 = await create(poId, createInput([{ id: line, qty: 1 }]))
    expect([r0.return_number, r1.return_number, r2.return_number]).toEqual([base, `${base}-1`, `${base}-2`])

    // Deleting a middle draft must not make the next create collide with -2.
    await resolvers.Mutation.deletePOReturn(null, { id: r1.id } as never, admin())
    const r3 = await create(poId, createInput([{ id: line, qty: 1 }]))
    expect(r3.return_number).toBe(`${base}-3`)
  })

  it('refuses a PO from another company', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1)
    await expect(
      create(poId, createInput([{ id: line, qty: 1 }]), ctxFor(adminId, 'company_admin', OTHER_COMPANY_ID)),
    ).rejects.toThrow(/Purchase order not found/)
  })
})

describe('permissions', () => {
  it('lets a user with procurement.po.edit create, submit and delete, but not approve or credit', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1)
    const editor = ctxFor(userIds.editor)

    const ret = await create(poId, createInput([{ id: line, qty: 1 }]), editor)
    await resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, editor)
    await expect(resolvers.Mutation.approvePOReturn(null, { id: ret.id } as never, editor)).rejects.toThrow(
      /procurement\.po\.approve/,
    )
    await expect(resolvers.Mutation.creditPOReturn(null, { id: ret.id } as never, editor)).rejects.toThrow(
      /finance\.ap\.edit/,
    )
    const second = await create(poId, createInput([{ id: line, qty: 1 }]), editor)
    await expect(resolvers.Mutation.deletePOReturn(null, { id: second.id } as never, editor)).resolves.toBe(true)
  })

  it('lets only an approver approve, and only finance credit', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1)
    const ret = await create(poId, createInput([{ id: line, qty: 1 }]))
    await resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, admin())

    await expect(
      resolvers.Mutation.approvePOReturn(null, { id: ret.id } as never, ctxFor(userIds.finance)),
    ).rejects.toThrow(/procurement\.po\.approve/)
    await resolvers.Mutation.approvePOReturn(null, { id: ret.id } as never, ctxFor(userIds.approver))

    await expect(
      resolvers.Mutation.creditPOReturn(null, { id: ret.id } as never, ctxFor(userIds.approver)),
    ).rejects.toThrow(/finance\.ap\.edit/)
    const credited = (await resolvers.Mutation.creditPOReturn(
      null,
      { id: ret.id, creditNoteReference: '  CN-1001  ' } as never,
      ctxFor(userIds.finance),
    )) as ReturnShape
    expect(credited.status).toBe('credited')
    expect(credited.credit_note_reference).toBe('CN-1001')
  })

  it('refuses a user with no grants on every operation', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1)
    const ret = await create(poId, createInput([{ id: line, qty: 1 }]))
    const plain = ctxFor(userIds.plain)

    await expect(create(poId, createInput([{ id: line, qty: 1 }]), plain)).rejects.toThrow(/Requires/)
    await expect(resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, plain)).rejects.toThrow(/Requires/)
    await expect(resolvers.Mutation.approvePOReturn(null, { id: ret.id } as never, plain)).rejects.toThrow(/Requires/)
    await expect(resolvers.Mutation.creditPOReturn(null, { id: ret.id } as never, plain)).rejects.toThrow(/Requires/)
    await expect(resolvers.Mutation.deletePOReturn(null, { id: ret.id } as never, plain)).rejects.toThrow(/Requires/)
    await expect(resolvers.Query.poReturns(null, { poId } as never, plain)).rejects.toThrow(/Requires/)
    await expect(resolvers.Query.poReturn(null, { id: ret.id } as never, plain)).rejects.toThrow(/Requires/)
    // …and the return is untouched
    const st = await pool.query(`SELECT status::text AS status FROM po_returns WHERE id=$1`, [ret.id])
    expect(st.rows[0].status).toBe('draft')
  })
})

describe('lifecycle', () => {
  it('walks draft → submitted → approved → credited and refuses out-of-order steps', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1)
    const ret = await create(poId, createInput([{ id: line, qty: 2 }]))
    const id = ret.id

    await expect(resolvers.Mutation.approvePOReturn(null, { id } as never, admin())).rejects.toThrow(
      /not in submitted status/,
    )
    await expect(resolvers.Mutation.creditPOReturn(null, { id } as never, admin())).rejects.toThrow(
      /not in approved status/,
    )

    const submitted = (await resolvers.Mutation.submitPOReturn(null, { id } as never, admin())) as ReturnShape
    expect(submitted.status).toBe('submitted')
    await expect(resolvers.Mutation.submitPOReturn(null, { id } as never, admin())).rejects.toThrow(
      /not in draft status/,
    )
    await expect(resolvers.Mutation.deletePOReturn(null, { id } as never, admin())).rejects.toThrow(
      /Only draft returns can be deleted/,
    )

    const approved = (await resolvers.Mutation.approvePOReturn(null, { id } as never, admin())) as ReturnShape
    expect(approved.status).toBe('approved')
    await expect(resolvers.Mutation.approvePOReturn(null, { id } as never, admin())).rejects.toThrow(
      /not in submitted status/,
    )

    const credited = (await resolvers.Mutation.creditPOReturn(null, { id } as never, admin())) as ReturnShape
    expect(credited.status).toBe('credited')
    expect(credited.credit_note_reference).toBeNull()
    await expect(resolvers.Mutation.creditPOReturn(null, { id } as never, admin())).rejects.toThrow(
      /not in approved status/,
    )
  })

  it('deletes a draft and its items', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1)
    const ret = await create(poId, createInput([{ id: line, qty: 1 }]))
    await expect(resolvers.Mutation.deletePOReturn(null, { id: ret.id } as never, admin())).resolves.toBe(true)
    const left = await pool.query(`SELECT 1 FROM po_return_items WHERE return_id=$1`, [ret.id])
    expect(left.rows.length).toBe(0)
    await expect(resolvers.Mutation.deletePOReturn(null, { id: ret.id } as never, admin())).rejects.toThrow(
      /Only draft returns can be deleted/,
    )
  })
})

describe('approvePOReturn salary deduction', () => {
  async function submittedDamageReturn() {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1, { price: 100 })
    const ret = await create(
      poId,
      createInput([{ id: line, qty: 2, assessed: 50 }], { return_type: 'damage', damage_description: 'dropped' }),
    )
    await resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, admin())
    return ret
  }

  it('creates a pending salary_deduction_request for the responsible employee', async () => {
    const ret = await submittedDamageReturn()
    const empId = await makeEmployee()
    const approved = (await resolvers.Mutation.approvePOReturn(
      null,
      {
        id: ret.id,
        input: { responsible_employee_id: empId, deduct_from_salary: true, deduction_amount: 75 },
      } as never,
      admin(),
    )) as ReturnShape

    expect(approved.status).toBe('approved')
    expect(approved.responsible_employee_id).toBe(empId)
    expect(approved.deduction_request_id).toBeTruthy()
    const sdr = await pool.query(
      `SELECT employee_id, amount, currency_code, status, reason FROM salary_deduction_requests
       WHERE source_type='po_return' AND source_id=$1`,
      [ret.id],
    )
    expect(sdr.rows).toHaveLength(1)
    expect(sdr.rows[0].employee_id).toBe(empId)
    expect(parseFloat(sdr.rows[0].amount)).toBe(75)
    expect(sdr.rows[0].currency_code.trim()).toBe('IQD')
    expect(sdr.rows[0].status).toBe('pending')
    expect(sdr.rows[0].reason).toContain(ret.return_number)
  })

  it('approves without a deduction when none is requested', async () => {
    const ret = await submittedDamageReturn()
    await resolvers.Mutation.approvePOReturn(null, { id: ret.id } as never, admin())
    const sdr = await pool.query(`SELECT 1 FROM salary_deduction_requests WHERE source_id=$1`, [ret.id])
    expect(sdr.rows).toHaveLength(0)
  })

  it('refuses a deduction without an employee or with a bad amount, leaving the return submitted', async () => {
    const ret = await submittedDamageReturn()
    const empId = await makeEmployee()
    await expect(
      resolvers.Mutation.approvePOReturn(
        null,
        { id: ret.id, input: { deduct_from_salary: true, deduction_amount: 10 } } as never,
        admin(),
      ),
    ).rejects.toThrow(/Select the responsible employee/)
    for (const amount of [0, -5, null]) {
      await expect(
        resolvers.Mutation.approvePOReturn(
          null,
          {
            id: ret.id,
            input: { responsible_employee_id: empId, deduct_from_salary: true, deduction_amount: amount },
          } as never,
          admin(),
        ),
      ).rejects.toThrow(/valid deduction amount/)
    }
    const st = await pool.query(`SELECT status::text AS status FROM po_returns WHERE id=$1`, [ret.id])
    expect(st.rows[0].status).toBe('submitted')
  })

  it('refuses an inactive employee, and an employee that does not exist', async () => {
    const ret = await submittedDamageReturn()
    const gone = await makeEmployee('terminated')
    const input = (employee: string) => ({
      id: ret.id,
      input: { responsible_employee_id: employee, deduct_from_salary: true, deduction_amount: 10 },
    })
    await expect(resolvers.Mutation.approvePOReturn(null, input(gone) as never, admin())).rejects.toThrow(
      /not found or not active/,
    )
    await expect(
      resolvers.Mutation.approvePOReturn(null, input('00000000-0000-0000-0000-0000000000aa') as never, admin()),
    ).rejects.toThrow(/not found or not active/)
    const sdr = await pool.query(`SELECT 1 FROM salary_deduction_requests WHERE source_id=$1`, [ret.id])
    expect(sdr.rows).toHaveLength(0)
  })

  it('refuses a responsible employee on a full-refund return', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1)
    const ret = await create(poId, createInput([{ id: line, qty: 1 }]))
    await resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, admin())
    const empId = await makeEmployee()
    await expect(
      resolvers.Mutation.approvePOReturn(
        null,
        { id: ret.id, input: { responsible_employee_id: empId, deduct_from_salary: true, deduction_amount: 10 } } as never,
        admin(),
      ),
    ).rejects.toThrow(/Only a damage return/)
  })
})

describe('queries', () => {
  it('lists the returns on a PO newest first with their items, and scopes by company', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1, { received: 10 })
    const a = await create(poId, createInput([{ id: line, qty: 1 }]))
    const b = await create(poId, createInput([{ id: line, qty: 2 }]))

    const list = (await resolvers.Query.poReturns(null, { poId } as never, admin())) as ReturnShape[]
    expect(list.map((r) => r.id)).toEqual([b.id, a.id])
    expect(list[0]!.items).toHaveLength(1)
    expect(parseFloat(list[0]!.items[0]!.quantity_returned)).toBe(2)

    const other = ctxFor(adminId, 'company_admin', OTHER_COMPANY_ID)
    expect(await resolvers.Query.poReturns(null, { poId } as never, other)).toEqual([])
    expect(await resolvers.Query.poReturn(null, { id: a.id } as never, other)).toBeNull()
    const one = (await resolvers.Query.poReturn(null, { id: a.id } as never, admin())) as ReturnShape
    expect(one.id).toBe(a.id)
  })

  it('does not let another company act on a return it can see no row for', async () => {
    const { poId } = await makePO('goods_received')
    const line = await makeLine(poId, 1)
    const ret = await create(poId, createInput([{ id: line, qty: 1 }]))
    const other = ctxFor(adminId, 'company_admin', OTHER_COMPANY_ID)

    await expect(resolvers.Mutation.submitPOReturn(null, { id: ret.id } as never, other)).rejects.toThrow(
      /Return not found/,
    )
    await expect(resolvers.Mutation.deletePOReturn(null, { id: ret.id } as never, other)).rejects.toThrow(
      /Only draft returns can be deleted/,
    )
    const st = await pool.query(`SELECT status::text AS status FROM po_returns WHERE id=$1`, [ret.id])
    expect(st.rows[0].status).toBe('draft')
  })
})
