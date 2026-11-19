// The Store Out printout says who has the equipment and that it must come back (playbook #107). The new fields are database text,
// so they go in escaped (playbook #54).
import { describe, it, expect } from 'vitest'
import { buildStoreOutHTML } from '../storeOutHtml'

const base = {
  issueNumber: 'SO-00201',
  issueDate: '2026-11-10',
  status: 'issued',
  lines: [
    {
      productName: 'Welding Machine',
      qtyIssued: 2,
      unitCost: 0,
      totalCost: 0,
      isReturnable: true,
      expectedReturnDate: '2026-11-17',
      serialNote: 'WM-4471',
    },
    { productName: 'Welding Rod', qtyIssued: 3, unitCost: 1, totalCost: 3 },
  ],
}

describe('buildStoreOutHTML: equipment', () => {
  it('prints who it was issued to with the department, and marks only the equipment line as to be returned', () => {
    const html = buildStoreOutHTML({ ...base, issuedToName: 'Ahmed Ali', department: 'Civil' })
    expect(html).toContain('Issued to')
    expect(html).toContain('Ahmed Ali · Civil')
    expect(html.match(/MUST BE RETURNED/g)).toHaveLength(1)
    expect(html).toContain('MUST BE RETURNED BY 2026-11-17 · WM-4471')
  })

  it('leaves the "Issued to" row out when nobody is named', () => {
    expect(buildStoreOutHTML(base)).not.toContain('Issued to')
  })

  it('shows hostile text literally and runs none of it', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const html = buildStoreOutHTML({
      ...base,
      issuedToName: evil,
      department: evil,
      lines: [{ ...base.lines[0], expectedReturnDate: evil, serialNote: evil }],
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})
