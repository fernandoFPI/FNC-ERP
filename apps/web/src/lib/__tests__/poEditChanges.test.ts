// Reading a stored PO edit request. The payload has been written three ways over time and all
// three are still in the database, so every one must come out readable.
import { describe, it, expect } from 'vitest'
import { describeEditChanges, formatEditValue, pctChange, toImpactView } from '../poEditChanges'

const onPo = [
  { id: 'cable', description: 'Cable 3x2.5', line_number: 1 },
  { id: 'box', description: 'Junction box', line_number: 2 },
]

describe('describeEditChanges', () => {
  it('groups the edits of one line under its recorded name', () => {
    const s = describeEditChanges(
      JSON.stringify({
        lines: {
          edited: [
            {
              id: 'cable',
              field: 'qty_ordered',
              from: '12.0000',
              to: 20,
              description: 'Cable 3x2.5',
            },
            {
              id: 'cable',
              field: 'unit_price',
              from: '4500.0000',
              to: 4800,
              description: 'Cable 3x2.5',
            },
            { id: 'box', field: 'uom', from: 'ea', to: 'pc', description: 'Junction box' },
          ],
        },
      }),
      [],
    )
    expect(s.edited.map((l) => [l.name, l.changes.map((c) => c.field)])).toEqual([
      ['Cable 3x2.5', ['qty_ordered', 'unit_price']],
      ['Junction box', ['uom']],
    ])
    expect(s.total).toBe(3)
  })

  describe('which line, and what it was', () => {
    const touched = [
      {
        id: 'cable',
        line_number: 3,
        description: 'Cable 3x2.5',
        qty: 12,
        unit_price: 4500,
        uom: 'm',
        currency_code: 'IQD',
        total: 54000,
      },
    ]

    it('uses the index and details recorded when the request was submitted', () => {
      const s = describeEditChanges(
        JSON.stringify({
          touched,
          lines: { edited: [{ id: 'cable', field: 'qty_ordered', from: 12, to: 20 }] },
        }),
        [], // the line is gone from the PO now
      )
      expect(s.edited[0]).toMatchObject({
        lineNumber: 3,
        name: 'Cable 3x2.5',
        details: { qty: 12, unitPrice: 4500, uom: 'm', currency: 'IQD', total: 54000 },
      })
    })

    it('takes the index of an older request from the lines still on the PO', () => {
      const s = describeEditChanges(
        JSON.stringify({
          lines: {
            edited: [{ id: 'box', field: 'qty_ordered', from: 3, to: 4 }],
            removed: ['cable'],
          },
        }),
        onPo,
      )
      expect(s.edited[0]).toMatchObject({ lineNumber: 2, name: 'Junction box', details: null })
      expect(s.removed[0]).toMatchObject({ lineNumber: 1, name: 'Cable 3x2.5' })
    })

    it('knows nothing about a line that is gone and was never recorded', () => {
      const s = describeEditChanges(
        JSON.stringify({
          lines: { edited: [{ id: 'gone', field: 'uom', from: 'a', to: 'b' }], removed: ['gone'] },
        }),
        onPo,
      )
      expect(s.edited[0]).toMatchObject({ lineNumber: null, name: null, details: null })
      expect(s.removed[0]).toMatchObject({ lineNumber: null, name: null })
    })

    it('prefers what was recorded over what the PO says now', () => {
      const s = describeEditChanges(
        JSON.stringify({
          touched: [{ id: 'cable', line_number: 7, description: 'Recorded' }],
          lines: { edited: [{ id: 'cable', field: 'uom', from: 'a', to: 'b' }] },
        }),
        onPo,
      )
      expect(s.edited[0]).toMatchObject({ lineNumber: 7, name: 'Recorded' })
    })
  })

  describe('names', () => {
    it('names an edit that recorded no name from the line as it is on the PO now', () => {
      const s = describeEditChanges(
        JSON.stringify({
          lines: { edited: [{ id: 'cable', field: 'qty_ordered', from: 1, to: 2 }] },
        }),
        onPo,
      )
      expect(s.edited[0]?.name).toBe('Cable 3x2.5')
    })

    it("uses a renamed line's old name, not the new one, when the request itself renames it", () => {
      const s = describeEditChanges(
        JSON.stringify({
          lines: {
            edited: [{ id: 'cable', field: 'description', from: 'Old cable', to: 'Cable 3x2.5' }],
          },
        }),
        onPo,
      )
      expect(s.edited[0]?.name).toBe('Old cable')
    })

    it('prefers the name recorded on the edit over everything else', () => {
      const s = describeEditChanges(
        JSON.stringify({
          lines: {
            edited: [
              {
                id: 'cable',
                field: 'description',
                from: 'Old cable',
                to: 'New',
                description: 'Recorded name',
              },
            ],
          },
        }),
        onPo,
      )
      expect(s.edited[0]?.name).toBe('Recorded name')
    })
  })

  describe('removed lines', () => {
    it('reads a removal recorded as an object', () => {
      const s = describeEditChanges(
        JSON.stringify({
          lines: {
            removed: [
              {
                id: 'box',
                line_number: 2,
                description: 'Junction box',
                qty: 3,
                unit_price: 900,
                uom: 'ea',
                currency_code: 'IQD',
              },
            ],
          },
        }),
        [],
      )
      expect(s.removed).toEqual([
        {
          lineId: 'box',
          lineNumber: 2,
          name: 'Junction box',
          details: { qty: 3, unitPrice: 900, uom: 'ea', currency: 'IQD', total: null },
        },
      ])
    })

    it('fills what an object lacks from the recorded line, including its total', () => {
      const s = describeEditChanges(
        JSON.stringify({
          touched: [
            {
              id: 'box',
              line_number: 2,
              description: 'Junction box',
              qty: 3,
              unit_price: 900,
              uom: 'ea',
              currency_code: 'IQD',
              total: 2700,
            },
          ],
          lines: { removed: [{ id: 'box', description: 'Junction box' }] },
        }),
        [],
      )
      expect(s.removed[0]).toMatchObject({
        lineNumber: 2,
        details: { qty: 3, unitPrice: 900, total: 2700 },
      })
    })

    it('resolves a bare id against the lines still on the PO (a pending request)', () => {
      const s = describeEditChanges(JSON.stringify({ lines: { removed: ['box'] } }), onPo)
      expect(s.removed[0]).toMatchObject({
        lineId: 'box',
        lineNumber: 2,
        name: 'Junction box',
        details: null,
      })
    })

    it('has no name for a bare id whose line is gone (an old approved request)', () => {
      const s = describeEditChanges(JSON.stringify({ lines: { removed: ['gone'] } }), onPo)
      expect(s.removed[0]).toMatchObject({ lineId: 'gone', name: null })
      expect(s.total).toBe(1)
    })
  })

  it('reads added lines, and both spellings of the quantity', () => {
    const s = describeEditChanges(
      JSON.stringify({
        lines: {
          added: [
            { description: 'Cable tie', qty: 100, unit_price: 25, uom: 'ea' },
            {
              description: 'Tape',
              qty_ordered: '4.0000',
              unit_price: '300.0000',
              currency_code: 'USD',
            },
            { qty: 1 },
          ],
        },
      }),
      [],
    )
    expect(s.added).toEqual([
      { description: 'Cable tie', qty: 100, unitPrice: 25, uom: 'ea', currency: null },
      { description: 'Tape', qty: 4, unitPrice: 300, uom: null, currency: 'USD' },
      { description: null, qty: 1, unitPrice: null, uom: null, currency: null },
    ])
  })

  it('counts every individual change, like the old card did', () => {
    const s = describeEditChanges(
      JSON.stringify({
        header: { notes: { from: '', to: 'x' }, expected_delivery_date: { from: 'a', to: 'b' } },
        lines: {
          edited: [
            { id: 'cable', field: 'qty_ordered', from: 1, to: 2 },
            { id: 'cable', field: 'unit_price', from: 1, to: 2 },
          ],
          added: [{ description: 'a' }, { description: 'b' }],
          removed: ['box'],
        },
      }),
      onPo,
    )
    expect(s.header.map((h) => h.field)).toEqual(['notes', 'expected_delivery_date'])
    expect(s.total).toBe(2 + 2 + 2 + 1)
  })

  it('shows an unreadable or empty payload as no changes instead of throwing', () => {
    for (const bad of ['', '{not json', 'null', '[]', '"text"', null, undefined]) {
      const s = describeEditChanges(bad, onPo)
      expect(s.total).toBe(0)
      expect(s.impact).toBeNull()
    }
  })
})

describe('how far a price or quantity moved', () => {
  it('is a percentage on the fields where that means something', () => {
    expect(pctChange('qty_ordered', 12, 20)).toBeCloseTo(66.67, 1)
    expect(pctChange('unit_price', '9000.0000', '4000')).toBeCloseTo(-55.56, 1)
    expect(pctChange('actual_unit_price', 100, 100)).toBe(0)
  })

  it('is empty for text fields, and when there was no starting value to compare with', () => {
    expect(pctChange('uom', 'ea', 'pc')).toBeNull()
    expect(pctChange('notes', 'a', 'b')).toBeNull()
    expect(pctChange('unit_price', 0, 50)).toBeNull()
    expect(pctChange('unit_price', null, 50)).toBeNull()
    expect(pctChange('unit_price', 'abc', 50)).toBeNull()
  })

  it('is attached to each edited price and quantity, and to nothing else', () => {
    const s = describeEditChanges(
      JSON.stringify({
        header: { notes: { from: '', to: 'x' } },
        lines: {
          edited: [
            { id: 'cable', field: 'qty_ordered', from: 10, to: 15 },
            { id: 'cable', field: 'uom', from: 'm', to: 'ft' },
          ],
        },
      }),
      onPo,
    )
    expect(s.header[0]?.pct).toBeNull()
    expect(s.edited[0]?.changes.map((c) => c.pct)).toEqual([50, null])
  })
})

describe('toImpactView', () => {
  it('reads totals and changed lines, with the change per currency', () => {
    const v = toImpactView({
      totals: [
        { currency_code: 'IQD', before: '56700.0000', after: '92700.0000' },
        { currency_code: 'USD', before: '100', after: '100' },
      ],
      lines: [
        {
          id: 'a',
          line_number: 1,
          description: 'Cable',
          currency_code: 'IQD',
          before: 54000,
          after: 90000,
        },
      ],
    })
    expect(v?.totals).toEqual([
      { currency: 'IQD', before: 56700, after: 92700, delta: 36000 },
      { currency: 'USD', before: 100, after: 100, delta: 0 },
    ])
    expect(v?.lines[0]).toMatchObject({ id: 'a', lineNumber: 1, before: 54000, after: 90000 })
    expect(v?.failure).toBeNull()
  })

  it('reads a removed or added line as one side missing', () => {
    const v = toImpactView({
      totals: [],
      lines: [
        { id: 'gone', line_number: 2, currency_code: 'IQD', before: 2700, after: null },
        { id: 'new', line_number: 4, currency_code: 'IQD', before: null, after: 2500 },
      ],
    })
    expect(v?.lines.map((l) => [l.before, l.after])).toEqual([
      [2700, null],
      [null, 2500],
    ])
  })

  it('reads a failure on its own', () => {
    expect(toImpactView({ totals: [], lines: [], failure: 'No exchange rate' })?.failure).toBe(
      'No exchange rate',
    )
  })

  it('is nothing when there is nothing to show', () => {
    expect(toImpactView(null)).toBeNull()
    expect(toImpactView(undefined)).toBeNull()
    expect(toImpactView('x')).toBeNull()
    expect(toImpactView({ totals: [], lines: [] })).toBeNull()
  })

  it('is what describeEditChanges returns for a request that recorded its impact', () => {
    const s = describeEditChanges(
      JSON.stringify({
        impact: { totals: [{ currency_code: 'IQD', before: '100', after: '60' }], lines: [] },
      }),
      [],
    )
    expect(s.impact?.totals[0]).toEqual({ currency: 'IQD', before: 100, after: 60, delta: -40 })
  })
})

describe('formatEditValue', () => {
  it('drops trailing zeros and groups thousands on numeric fields', () => {
    expect(formatEditValue('qty_ordered', '1.0000')).toBe('1')
    expect(formatEditValue('unit_price', '4500.0000')).toBe('4,500')
    expect(formatEditValue('unit_price', 12.5)).toBe('12.5')
    expect(formatEditValue('actual_unit_price', 0)).toBe('0')
  })

  it('leaves text alone, and shows an empty value as a dash', () => {
    expect(formatEditValue('notes', 'deliver to gate 2')).toBe('deliver to gate 2')
    expect(formatEditValue('uom', 'ea')).toBe('ea')
    expect(formatEditValue('notes', '')).toBe('—')
    expect(formatEditValue('notes', null)).toBe('—')
    expect(formatEditValue('qty_ordered', undefined)).toBe('—')
  })
})
