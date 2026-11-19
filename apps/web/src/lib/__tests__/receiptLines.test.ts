// The arithmetic and the rules of the Record Goods Receipt form (lib/receiptLines.ts). The page draws its checklist and its
// action bar from receiptRequirements and refuses a submit on its first open item, so the order and the conditions here are
// what the user is told.
import { describe, it, expect } from 'vitest'
import {
  clampReceiveQty,
  clearLines,
  isLineComplete,
  isLineReceiving,
  receiptRequirements,
  receiptTotals,
  remainingQty,
  selectAllLines,
  selectLine,
  type ReceiptLine,
} from '../receiptLines'

const line = (over: Partial<ReceiptLine> = {}): ReceiptLine => ({
  po_line_id: 'l1',
  description: 'AC cover',
  sku: null,
  ordered_qty: 10,
  qty_received_so_far: 0,
  qty_from_stock: 0,
  qty_to_receive: '10',
  po_unit_price: 5,
  selected: false,
  ...over,
})

describe('remainingQty and isLineComplete', () => {
  it('is what was ordered, less what arrived before and what stock already covers', () => {
    expect(remainingQty(line({ ordered_qty: 10, qty_received_so_far: 3, qty_from_stock: 2 }))).toBe(5)
  })

  it('never goes below zero when a line was received over its quantity', () => {
    expect(remainingQty(line({ ordered_qty: 4, qty_received_so_far: 6 }))).toBe(0)
  })

  it('a line with nothing left is complete, whether it arrived or stock covers it', () => {
    expect(isLineComplete(line({ ordered_qty: 4, qty_received_so_far: 4 }))).toBe(true)
    expect(isLineComplete(line({ ordered_qty: 4, qty_from_stock: 4 }))).toBe(true)
    expect(isLineComplete(line({ ordered_qty: 4, qty_received_so_far: 3 }))).toBe(false)
  })
})

describe('clampReceiveQty', () => {
  it('cuts a quantity above what is left to what is left, so nobody over-receives by a typo', () => {
    expect(clampReceiveQty('99', 3)).toBe('3')
    expect(clampReceiveQty('3.5', 3)).toBe('3')
  })

  it('keeps a quantity at or below the limit exactly as typed', () => {
    expect(clampReceiveQty('3', 3)).toBe('3')
    expect(clampReceiveQty('2.50', 3)).toBe('2.50')
    expect(clampReceiveQty('0', 3)).toBe('0')
  })

  it('leaves an empty or half-typed box alone, so it can be emptied and refilled', () => {
    expect(clampReceiveQty('', 3)).toBe('')
    expect(clampReceiveQty('-', 3)).toBe('-')
    expect(clampReceiveQty('abc', 3)).toBe('abc')
  })
})

describe('isLineReceiving', () => {
  it('needs the line ticked AND a quantity above zero', () => {
    expect(isLineReceiving(line({ selected: true, qty_to_receive: '2' }))).toBe(true)
    expect(isLineReceiving(line({ selected: false, qty_to_receive: '2' }))).toBe(false)
    expect(isLineReceiving(line({ selected: true, qty_to_receive: '0' }))).toBe(false)
    expect(isLineReceiving(line({ selected: true, qty_to_receive: '' }))).toBe(false)
  })
})

describe('selectLine, selectAllLines, clearLines', () => {
  it('ticking a line keeps a quantity that was typed', () => {
    const next = selectLine(line({ qty_to_receive: '4' }), true)
    expect(next).toMatchObject({ selected: true, qty_to_receive: '4' })
  })

  it('ticking a line whose box was emptied or zeroed starts it at everything that is left', () => {
    expect(selectLine(line({ qty_to_receive: '', ordered_qty: 10, qty_received_so_far: 4 }), true).qty_to_receive).toBe('6')
    expect(selectLine(line({ qty_to_receive: '0', ordered_qty: 10, qty_received_so_far: 4 }), true).qty_to_receive).toBe('6')
  })

  it('unticking keeps the quantity, so ticking again does not lose it', () => {
    expect(selectLine(line({ selected: true, qty_to_receive: '4' }), false)).toMatchObject({
      selected: false,
      qty_to_receive: '4',
    })
  })

  it('Select all ticks every line with something left, keeps typed quantities, and skips complete lines', () => {
    const lines = [
      line({ po_line_id: 'a', qty_to_receive: '' }),
      line({ po_line_id: 'b', qty_to_receive: '3' }),
      line({ po_line_id: 'c', ordered_qty: 4, qty_received_so_far: 4, qty_to_receive: '0' }),
    ]
    const next = selectAllLines(lines)
    expect(next.map((l) => l.selected)).toEqual([true, true, false])
    expect(next[0].qty_to_receive).toBe('10')
    expect(next[1].qty_to_receive).toBe('3')
    expect(next[2]).toEqual(lines[2])
  })

  it('Clear unticks every line and touches nothing else', () => {
    const lines = [line({ selected: true, qty_to_receive: '7' }), line({ po_line_id: 'b', selected: true })]
    const next = clearLines(lines)
    expect(next.every((l) => !l.selected)).toBe(true)
    expect(next[0].qty_to_receive).toBe('7')
  })
})

describe('receiptTotals', () => {
  it('adds up the order, what is covered already, what is being received and what stays open', () => {
    const t = receiptTotals([
      line({ po_line_id: 'a', ordered_qty: 10, qty_received_so_far: 2, qty_from_stock: 1, selected: true, qty_to_receive: '4' }),
      line({ po_line_id: 'b', ordered_qty: 5, selected: false, qty_to_receive: '5' }),
    ])
    expect(t).toMatchObject({
      itemCount: 2,
      selectedCount: 1,
      orderedQtyTotal: 15,
      alreadyCoveredQty: 3,
      receivingNowQty: 4,
      remainingAfterQty: 8,
    })
  })

  it('counts only ticked lines as being received', () => {
    expect(receiptTotals([line({ selected: false, qty_to_receive: '9' })]).receivingNowQty).toBe(0)
  })

  it('reads an emptied box as zero, not as a number that breaks the sum', () => {
    expect(receiptTotals([line({ selected: true, qty_to_receive: '' })]).receivingNowQty).toBe(0)
  })

  it('is a percentage of the order that is covered, capped at 100, and 0 for an empty order', () => {
    expect(receiptTotals([line({ ordered_qty: 10, qty_received_so_far: 5, selected: true, qty_to_receive: '2' })]).progressPct).toBe(70)
    expect(receiptTotals([line({ ordered_qty: 10, qty_received_so_far: 8, selected: true, qty_to_receive: '9' })]).progressPct).toBe(100)
    expect(receiptTotals([]).progressPct).toBe(0)
  })

  it('never reports a negative remainder', () => {
    expect(receiptTotals([line({ ordered_qty: 2, qty_received_so_far: 2, selected: true, qty_to_receive: '5' })]).remainingAfterQty).toBe(0)
  })
})

describe('receiptRequirements', () => {
  const base = {
    isJobsite: false,
    receiverName: 'Sara Ali',
    lines: [line({ selected: true, qty_to_receive: '2' })],
    hasVendorReceipt: false,
    hasMaterialsPhoto: false,
    photosBypassed: false,
  }
  const done = (reqs: ReturnType<typeof receiptRequirements>) => reqs.map((r) => `${r.id}:${r.done}`)

  it('goods going into a temporary store also need a final destination, listed after the item and only then', () => {
    expect(done(receiptRequirements({ ...base, needsDestination: true, hasDestination: false }))).toEqual(['receiver:true', 'items:true', 'destination:false'])
    expect(done(receiptRequirements({ ...base, needsDestination: true, hasDestination: true }))).toEqual(['receiver:true', 'items:true', 'destination:true'])
    expect(done(receiptRequirements({ ...base, needsDestination: false, hasDestination: false }))).toEqual(['receiver:true', 'items:true'])
    // a jobsite delivery never goes through a store
    expect(receiptRequirements({ ...base, isJobsite: true, needsDestination: true }).map((r) => r.id)).not.toContain('destination')
  })

  it('a Store In delivery needs who received it, then at least one item (in that order)', () => {
    expect(done(receiptRequirements({ ...base, receiverName: '', lines: [line()] }))).toEqual([
      'receiver:false',
      'items:false',
    ])
    expect(done(receiptRequirements(base))).toEqual(['receiver:true', 'items:true'])
  })

  it('a receiver that is only spaces is not a receiver', () => {
    expect(receiptRequirements({ ...base, receiverName: '   ' })[0].done).toBe(false)
  })

  it('a jobsite delivery needs no receiver: items first, then the vendor receipt, then the materials photo', () => {
    expect(done(receiptRequirements({ ...base, isJobsite: true, receiverName: '' }))).toEqual([
      'items:true',
      'vendorReceipt:false',
      'materials:false',
    ])
  })

  it('each photo is done once it is there, on its own', () => {
    expect(
      done(receiptRequirements({ ...base, isJobsite: true, hasVendorReceipt: true })),
    ).toEqual(['items:true', 'vendorReceipt:true', 'materials:false'])
    expect(
      done(receiptRequirements({ ...base, isJobsite: true, hasMaterialsPhoto: true })),
    ).toEqual(['items:true', 'vendorReceipt:false', 'materials:true'])
  })

  it('an administrator override counts both photos as done, and nothing else', () => {
    const reqs = receiptRequirements({
      ...base,
      isJobsite: true,
      photosBypassed: true,
      lines: [line()],
    })
    expect(done(reqs)).toEqual(['items:false', 'vendorReceipt:true', 'materials:true'])
  })

  it('an override on a Store In delivery changes nothing (it only exists for the jobsite path)', () => {
    expect(done(receiptRequirements({ ...base, photosBypassed: true, receiverName: '' }))).toEqual([
      'receiver:false',
      'items:true',
    ])
  })

  it('a line that is ticked with no quantity is not an item', () => {
    expect(
      receiptRequirements({ ...base, lines: [line({ selected: true, qty_to_receive: '0' })] })[1].done,
    ).toBe(false)
  })
})
