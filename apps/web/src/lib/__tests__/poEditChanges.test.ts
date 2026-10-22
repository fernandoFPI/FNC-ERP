// Reading a stored PO edit request. The payload has been written three ways over time
// and all three are still in the database, so every one must come out readable.
import { describe, it, expect } from 'vitest'
import { describeEditChanges, formatEditValue } from '../poEditChanges'

const onPo = [
  { id: 'cable', description: 'Cable 3x2.5' },
  { id: 'box', description: 'Junction box' },
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

  it('prefers the name recorded at submission over everything else', () => {
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

  it('has no name for an edited line that is gone and was never named', () => {
    const s = describeEditChanges(
      JSON.stringify({ lines: { edited: [{ id: 'gone', field: 'uom', from: 'a', to: 'b' }] } }),
      onPo,
    )
    expect(s.edited[0]?.name).toBeNull()
  })

  describe('removed lines', () => {
    it('reads a removal recorded as an object', () => {
      const s = describeEditChanges(
        JSON.stringify({
          lines: {
            removed: [
              {
                id: 'box',
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
        { lineId: 'box', name: 'Junction box', qty: 3, unitPrice: 900, uom: 'ea', currency: 'IQD' },
      ])
    })

    it('resolves a bare id against the lines still on the PO (a pending request)', () => {
      const s = describeEditChanges(JSON.stringify({ lines: { removed: ['box'] } }), onPo)
      expect(s.removed[0]).toMatchObject({ lineId: 'box', name: 'Junction box', qty: null })
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
    }
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
