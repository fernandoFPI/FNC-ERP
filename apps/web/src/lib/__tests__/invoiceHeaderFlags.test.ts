import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  INVOICE_HEADER_FLAG_FIELDS,
  invoiceHeaderValue,
  type InvoiceHeaderSource,
} from '../invoiceHeaderFlags'

// The page's list of flaggable header fields, the projects service's list and the database's CHECK constraint
// are three copies of one fact; this pins the first two to the migration so they cannot drift apart.
const REPO = resolve(__dirname, '../../../../..')
const read = (p: string): string => readFileSync(resolve(REPO, p), 'utf8')
const quoted = (s: string): string[] => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

describe('INVOICE_HEADER_FLAG_FIELDS', () => {
  it("is exactly the migration's CHECK list, in printed order", () => {
    const sql = read('packages/db/migrations/314_project_invoice_header_flags.sql')
    const list = /CHECK \(field IN \(([\s\S]*?)\)\)/.exec(sql)?.[1] ?? ''
    expect(quoted(list)).toEqual([...INVOICE_HEADER_FLAG_FIELDS])
  })

  it("is exactly the projects service's list", () => {
    const ts = read('services/projects/src/lib/invoiceHeaderFlags.ts')
    const list = /INVOICE_HEADER_FLAG_FIELDS = \[([\s\S]*?)\] as const/.exec(ts)?.[1] ?? ''
    expect(quoted(list)).toEqual([...INVOICE_HEADER_FLAG_FIELDS])
  })
})

describe('invoiceHeaderValue', () => {
  const inv: InvoiceHeaderSource = {
    invoiceDate: '2026-09-03T00:00:00.000Z',
    dueDate: '2026-10-03',
    invoiceNumber: 'INV-2026-0002',
    deliverToAddress: 'farage\nErbil',
    billToAddress: 'farage\nAttention: n/a',
    clientContractNo: 'RFQ-2026-0002',
    projectName: 'Farage Holding',
    periodOfPerformance: '15/07/2026 – 15/08/2026',
    deliveryDate: null,
    projectCode: 'PRJ-2026-0001',
  }

  it('reads each field from the place the printed header gets it', () => {
    const got = Object.fromEntries(
      INVOICE_HEADER_FLAG_FIELDS.map((f) => [f, invoiceHeaderValue(inv, f)]),
    )
    expect(got).toEqual({
      invoice_date: '2026-09-03',
      due_date: '2026-10-03',
      invoice_number: 'INV-2026-0002',
      deliver_to_address: 'farage\nErbil',
      bill_to_address: 'farage\nAttention: n/a',
      client_contract_no: 'RFQ-2026-0002',
      job: 'Farage Holding',
      period_of_performance: '15/07/2026 – 15/08/2026',
      delivery_date: '',
      reference: 'PRJ-2026-0001',
    })
  })

  it('is empty, not "null", for a field the invoice does not have', () => {
    expect(invoiceHeaderValue({}, 'client_contract_no')).toBe('')
    expect(invoiceHeaderValue({ deliveryDate: null }, 'delivery_date')).toBe('')
  })
})
