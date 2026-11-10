import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  projectCloseoutGate,
  PAID_INVOICE_STATUS,
  DEAD_INVOICE_STATUSES,
} from '../projectFinancing'

const inv = (...statuses: string[]) => statuses.map((status) => ({ status }))

describe('projectCloseoutGate', () => {
  it('says nothing while the invoices are unknown: the server decides', () => {
    expect(projectCloseoutGate(null, false)).toBeNull()
    expect(projectCloseoutGate(undefined, true)).toBeNull()
  })

  it('every invoice paid: nothing blocks, whoever you are', () => {
    expect(projectCloseoutGate(inv('paid', 'paid'), false)).toBeNull()
    expect(projectCloseoutGate(inv('paid'), true)).toBeNull()
  })

  it('counts every invoice that is not paid, and an administrator is not excused from it', () => {
    for (const status of ['draft', 'review', 'approved', 'issued', 'partial']) {
      expect(projectCloseoutGate(inv('paid', status), false)).toEqual({ kind: 'unpaid', open: 1 })
      expect(projectCloseoutGate(inv('paid', status), true)).toEqual({ kind: 'unpaid', open: 1 })
    }
    expect(projectCloseoutGate(inv('issued', 'partial', 'draft', 'paid'), true)).toEqual({
      kind: 'unpaid',
      open: 3,
    })
  })

  it('a status it has never heard of blocks too', () => {
    expect(projectCloseoutGate(inv('paid', 'quarantined'), false)).toEqual({
      kind: 'unpaid',
      open: 1,
    })
  })

  it('cancelled and void invoices are neither unpaid nor an invoice', () => {
    expect(projectCloseoutGate(inv('paid', 'cancelled', 'void'), false)).toBeNull()
    expect(projectCloseoutGate(inv('cancelled', 'void'), false)).toEqual({ kind: 'none' })
    expect(projectCloseoutGate(inv('cancelled', 'void'), true)).toBeNull()
  })

  it('no invoices at all: blocked for everyone but an administrator', () => {
    expect(projectCloseoutGate([], false)).toEqual({ kind: 'none' })
    expect(projectCloseoutGate([], true)).toBeNull()
  })
})

describe('the server rule it mirrors (packages/db/src/projectCloseout.ts)', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../../../../packages/db/src/projectCloseout.ts'),
    'utf8',
  )

  it('uses the same paid and never-paid statuses', () => {
    expect(src).toContain(`export const PAID_INVOICE_STATUS = '${PAID_INVOICE_STATUS}'`)
    const m = /export const DEAD_INVOICE_STATUSES = \[([^\]]*)\] as const/.exec(src)
    const list = m?.[1]
    if (list === undefined) throw new Error('DEAD_INVOICE_STATUSES not found in projectCloseout.ts')
    const server = [...list.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    expect(server).toEqual([...DEAD_INVOICE_STATUSES])
  })

  it('still treats anything that is not paid as blocking (an allow-list of what settles an invoice)', () => {
    expect(src).toContain('if (row.status !== PAID_INVOICE_STATUS)')
  })
})
