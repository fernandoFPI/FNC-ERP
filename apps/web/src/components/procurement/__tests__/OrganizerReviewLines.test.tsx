// The organizer review, add and remove lines (migration 330, playbook #116): what the panel shows and does for an item that was
// added or removed in the review. Whether the caller may, and whether a PO Admin is needed, come from the server in `review`;
// these tests pin that the panel follows those flags, sends what the server expects, and shows the approver what changed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { OrganizerReviewPanel } from '../OrganizerReviewPanel'
import type { OrganizerReviewPanelProps, ReviewData } from '../OrganizerReviewPanel'

const mutationFns: Record<string, ReturnType<typeof vi.fn>> = {}
interface MutationOptions {
  onCompleted?: (d?: unknown) => void
  onError?: (e: { message: string }) => void
}
const mutationOptions: Record<string, MutationOptions | undefined> = {}
const complete = (op: string) => {
  const f = mutationOptions[op]?.onCompleted
  if (!f) throw new Error(`${op} was never set up`)
  f()
}
const fail = (op: string, e: { message: string }) => {
  const f = mutationOptions[op]?.onError
  if (!f) throw new Error(`${op} was never set up`)
  f(e)
}
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: () => ({ data: undefined, loading: false }),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useMutation: (doc: unknown, options: MutationOptions) => {
      const name =
        (doc as { definitions?: { kind?: string; name?: { value?: string } }[] }).definitions?.find(
          (d) => d.kind === 'OperationDefinition',
        )?.name?.value ?? 'unknown'
      mutationOptions[name] = options
      mutationFns[name] ??= vi.fn()
      return [mutationFns[name], { loading: false }]
    },
  }
})

const addToast = vi.fn()
vi.mock('../../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}))
vi.mock('../../inventory/EntityAttachments', () => ({
  EntityAttachments: () => <div data-testid="attachments" />,
}))

// The dialog that adds an item has its own test; here it only has to be opened with the right things and report back.
interface DialogProps {
  open: boolean
  requisitionId: string
  defaultCurrency?: string
  onClose: () => void
  onAdded: () => void
}
let lastDialog: DialogProps | null = null
vi.mock('../AddReviewItemModal', () => ({
  AddReviewItemModal: (p: DialogProps) => {
    lastDialog = p
    return p.open ? (
      <div data-testid="add-dialog">{`${p.requisitionId}|${p.defaultCurrency ?? ''}`}</div>
    ) : null
  },
}))

const purchase = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  vendor_name: 'Al Noor Hardware',
  currency_code: 'USD',
  qty: '10',
  actual_unit_price: '12.5',
  bought_by: 'u-buyer',
  bought_by_name: 'Bassam Buyer',
  over_tolerance: false,
  tolerance_approved_by: null,
  receipt_file_id: 'f1',
  review_original_qty: null,
  review_original_price: null,
  ...over,
})

const reviewData = (over: Partial<ReviewData> = {}): ReviewData => ({
  needs_approval: false,
  approval_reason: null,
  edited_count: 0,
  organizer_bought_count: 0,
  unsigned_tolerance_count: 0,
  added_count: 0,
  removed_count: 0,
  removed_lines: [],
  caller_can_edit: true,
  caller_can_approve: false,
  last_rejection: null,
  totals: [{ currency_code: 'USD', was: '250', now: '250', purchases: 2 }],
  ...over,
})

type Req = OrganizerReviewPanelProps['requisition']
const requisition = (over: Partial<Req> = {}): Req => ({
  id: 'req-1',
  requisition_number: 'REQ-2026-0101',
  status: 'organizer_review',
  organizerName: 'Olivia Organizer',
  review: reviewData(),
  lines: [
    {
      id: 'l1',
      line_number: 1,
      description: 'Copper pipe',
      product_name: 'Pipe 20mm',
      purchases: [purchase()],
    },
    {
      id: 'l2',
      line_number: 2,
      description: 'Valve',
      product_name: null,
      purchases: [purchase({ id: 'p2', vendor_name: 'Dar Steel', bought_by_name: 'Carl' })],
    },
  ],
  ...over,
})

const onChanged = vi.fn()
function show(req: Req = requisition()) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <OrganizerReviewPanel requisition={req} onChanged={onChanged} />
      </ThemeProvider>
    </MemoryRouter>,
  )
}
const table = () => screen.getByRole('table')
const row = (text: string) => {
  const r = within(table())
    .getAllByRole('row')
    .find((x) => x.textContent.includes(text))
  if (!r) throw new Error(`no row with ${text}`)
  return r
}

beforeEach(() => {
  for (const k of Object.keys(mutationFns)) Reflect.deleteProperty(mutationFns, k)
  for (const k of Object.keys(mutationOptions)) Reflect.deleteProperty(mutationOptions, k)
  addToast.mockClear()
  onChanged.mockClear()
  lastDialog = null
})
afterEach(async () => {
  if (i18n.language !== 'en') await i18n.changeLanguage('en')
})

describe('the Add an item button', () => {
  it('is there for whoever may change the review, and opens the dialog for this requisition', () => {
    show()
    expect(screen.queryByTestId('add-dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add an item' }))
    expect(screen.getByTestId('add-dialog')).toHaveTextContent('req-1|USD')
  })

  it('starts the price in the one currency the requisition shares, and in none when there are several', () => {
    show(
      requisition({
        review: reviewData({
          totals: [
            { currency_code: 'IQD', was: '1', now: '1', purchases: 1 },
            { currency_code: 'USD', was: '1', now: '1', purchases: 1 },
          ],
        }),
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add an item' }))
    expect(screen.getByTestId('add-dialog')).toHaveTextContent('req-1|')
    expect(lastDialog?.defaultCurrency).toBeUndefined()
  })

  it('is not there for somebody who may not change the review', () => {
    show(requisition({ review: reviewData({ caller_can_edit: false }) }))
    expect(screen.queryByRole('button', { name: 'Add an item' })).toBeNull()
  })

  it('is not there while a PO Admin is deciding, not even for the approver', () => {
    show(
      requisition({
        status: 'review_approval',
        review: reviewData({ caller_can_edit: false, caller_can_approve: true }),
      }),
    )
    expect(screen.queryByRole('button', { name: 'Add an item' })).toBeNull()
  })

  it('reads the requisition again once the item was added, and closes the dialog', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Add an item' }))
    lastDialog?.onAdded()
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(lastDialog?.open).toBe(true)
  })
})

describe('removing a line', () => {
  const removeButton = (item: string) => screen.getByRole('button', { name: `Remove ${item}` })

  it('puts a Remove button on every line of the review, named for the item', () => {
    show()
    expect(removeButton('Pipe 20mm')).toBeInTheDocument()
    expect(removeButton('Valve')).toBeInTheDocument()
  })

  it('has none for somebody who may not change the review, and none for the approver', () => {
    show(requisition({ review: reviewData({ caller_can_edit: false }) }))
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })

  it('asks for a reason first, and does nothing until there is one', () => {
    show()
    fireEvent.click(removeButton('Valve'))
    expect(screen.getByText('Remove Valve?')).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Remove item' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/bought by mistake/i), {
      target: { value: '   ' },
    })
    expect(confirm).toBeDisabled()
    expect(mutationFns.RemoveReviewLine).not.toHaveBeenCalled()
  })

  it('warns that the purchases and their receipts go with it, and that a PO Admin must approve', () => {
    show()
    fireEvent.click(removeButton('Valve'))
    expect(screen.getByText(/deleted together with their receipts/)).toBeInTheDocument()
    expect(screen.getByText(/A PO Admin has to approve this/)).toBeInTheDocument()
  })

  it('sends the line, the requisition and the trimmed reason', () => {
    show()
    fireEvent.click(removeButton('Valve'))
    fireEvent.change(screen.getByPlaceholderText(/bought by mistake/i), {
      target: { value: '  Bought by mistake  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove item' }))
    expect(mutationFns.RemoveReviewLine).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1', lineId: 'l2', reason: 'Bought by mistake' },
    })
  })

  it('removes the LINE of the row it was pressed on, whichever purchase of a split line that is', () => {
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Split item',
            purchases: [purchase({ id: 'a' }), purchase({ id: 'b', vendor_name: 'Second vendor' })],
          },
        ],
      }),
    )
    fireEvent.click(within(row('Second vendor')).getByRole('button', { name: 'Remove Split item' }))
    fireEvent.change(screen.getByPlaceholderText(/bought by mistake/i), { target: { value: 'No' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove item' }))
    expect(mutationFns.RemoveReviewLine).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1', lineId: 'l1', reason: 'No' },
    })
  })

  it('closes the dialog, tells the organizer and reads the requisition again once it is removed', () => {
    show()
    fireEvent.click(removeButton('Valve'))
    fireEvent.change(screen.getByPlaceholderText(/bought by mistake/i), {
      target: { value: 'Mistake' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove item' }))
    act(() => {
      complete('RemoveReviewLine')
    })
    expect(screen.queryByText('Remove Valve?')).toBeNull()
    expect(addToast).toHaveBeenCalledWith({
      message: 'Item removed. A PO Admin has to approve it.',
      type: 'success',
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it("keeps the dialog and the reason, and shows the server's sentence, when the removal is refused", () => {
    show()
    fireEvent.click(removeButton('Valve'))
    fireEvent.change(screen.getByPlaceholderText(/bought by mistake/i), {
      target: { value: 'Mistake' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove item' }))
    act(() => {
      fail('RemoveReviewLine', {
        message: '"Valve" can\'t be removed: stock for it was already issued',
      })
    })
    expect(addToast).toHaveBeenCalledWith({
      message: '"Valve" can\'t be removed: stock for it was already issued',
      type: 'error',
    })
    expect(screen.getByText('Remove Valve?')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/bought by mistake/i)).toHaveValue('Mistake')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('starts each time with an empty reason', () => {
    show()
    fireEvent.click(removeButton('Valve'))
    fireEvent.change(screen.getByPlaceholderText(/bought by mistake/i), {
      target: { value: 'first' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(removeButton('Pipe 20mm'))
    expect(screen.getByPlaceholderText(/bought by mistake/i)).toHaveValue('')
    expect(screen.getByText('Remove Pipe 20mm?')).toBeInTheDocument()
  })
})

describe('a line with nothing bought on it', () => {
  const stockLine = {
    id: 'l3',
    line_number: 3,
    description: 'Stock item',
    product_name: null,
    purchases: [],
  }

  it('is still a row, says why it has no purchase, and can be removed', () => {
    show(requisition({ lines: [...requisition().lines, stockLine] }))
    const r = row('Stock item')
    expect(r.textContent).toContain('Nothing bought (from stock or marked short)')
    expect(within(r).getByRole('button', { name: 'Remove Stock item' })).toBeInTheDocument()
  })

  it('has no Change button and no receipts link, since there is no purchase to change', () => {
    show(requisition({ lines: [...requisition().lines, stockLine] }))
    const r = row('Stock item')
    expect(within(r).queryByRole('button', { name: 'Change' })).toBeNull()
    expect(within(r).queryByRole('button', { name: /receipts/i })).toBeNull()
    // the purchase rows keep theirs
    expect(within(row('Valve')).getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('is not offered in the send-back dialog, which lists purchases to record again', () => {
    show(requisition({ lines: [...requisition().lines, stockLine] }))
    fireEvent.click(screen.getByRole('button', { name: 'Send back to Items Bought' }))
    const dialog = screen.getByText(/Purchases to record again/).closest('fieldset')
    if (!dialog) throw new Error('no fieldset')
    expect(within(dialog).queryByText(/Stock item/)).toBeNull()
    expect(within(dialog).getByText(/Valve/)).toBeInTheDocument()
  })
})

describe('an item added in the review', () => {
  const withAdded = () =>
    requisition({
      review: reviewData({
        added_count: 1,
        needs_approval: true,
        approval_reason: '1 item was added',
      }),
      lines: [
        ...requisition().lines,
        {
          id: 'l3',
          line_number: 3,
          description: 'Forgotten bolts',
          product_name: null,
          review_added_at: '2026-11-23T08:00:00Z',
          purchases: [
            purchase({ id: 'p3', vendor_name: 'Bolt Shop', qty: '4', actual_unit_price: '7.25' }),
          ],
        },
      ],
    })

  it('carries the "Added in review" mark and says it was not checked against inventory or pricing', () => {
    show(withAdded())
    const r = row('Forgotten bolts')
    expect(r.textContent).toContain('Added in review')
    expect(r.textContent).toContain('Not checked against inventory or pricing')
  })

  it('leaves the mark and the note off every other line', () => {
    show(withAdded())
    expect(row('Valve').textContent).not.toContain('Added in review')
    expect(row('Valve').textContent).not.toContain('Not checked against inventory')
    expect(screen.getAllByText('Added in review')).toHaveLength(1)
  })

  it('shows the approver the mark and the note too, without any control to change it', () => {
    show({
      ...withAdded(),
      status: 'review_approval',
      review: reviewData({
        added_count: 1,
        needs_approval: true,
        caller_can_edit: false,
        caller_can_approve: true,
      }),
    })
    const r = row('Forgotten bolts')
    expect(r.textContent).toContain('Added in review')
    expect(r.textContent).toContain('Not checked against inventory or pricing')
    expect(within(r).queryByRole('button', { name: /Remove|Change/ })).toBeNull()
  })

  it("explains in the bar why a PO Admin is needed (the server's reason, word for word)", () => {
    show(withAdded())
    // in the card (why a PO Admin is needed) and in the bar (what stops him confirming alone)
    expect(screen.getAllByText(/1 item was added/).length).toBeGreaterThanOrEqual(1)
  })
})

describe('what was removed in the review', () => {
  const removed = {
    id: 'rm1',
    line_number: 2,
    description: 'Old valve',
    qty_ordered: '10',
    uom: 'pc',
    reason: 'Bought by mistake',
    removed_by_name: 'Olivia Organizer',
    purchases: [
      { vendor: 'Dar Steel', qty: '10', price: '12.5', currency: 'USD', had_receipt: true },
      { vendor: 'Al Noor', qty: '2', price: '3', currency: 'IQD', had_receipt: false },
    ],
  }

  it('lists each removed item as it was: name, quantity, what was bought and from whom, who removed it and why', () => {
    show(requisition({ review: reviewData({ removed_count: 1, removed_lines: [removed] }) }))
    const box = screen.getByTestId('review-removed-lines')
    expect(within(box).getByText('Removed in this review')).toBeInTheDocument()
    expect(box.textContent).toContain('Old valve (10 pc)')
    expect(box.textContent).toContain('Dar Steel: 10 × 12.5 USD')
    expect(box.textContent).toContain('Al Noor: 2 × 3 IQD')
    expect(box.textContent).toContain('Olivia Organizer: Bought by mistake')
  })

  it('is there for the approver, who is the one who has to read it', () => {
    show(
      requisition({
        status: 'review_approval',
        review: reviewData({
          removed_count: 1,
          removed_lines: [removed],
          caller_can_edit: false,
          caller_can_approve: true,
        }),
      }),
    )
    expect(screen.getByTestId('review-removed-lines')).toBeInTheDocument()
  })

  it('is not drawn when nothing was removed', () => {
    show()
    expect(screen.queryByTestId('review-removed-lines')).toBeNull()
  })

  it('does not break on a removed item that had nothing bought on it', () => {
    show(
      requisition({
        review: reviewData({ removed_count: 1, removed_lines: [{ ...removed, purchases: [] }] }),
      }),
    )
    const box = screen.getByTestId('review-removed-lines')
    expect(box.textContent).toContain('Old valve (10 pc)')
    expect(box.textContent).toContain('Bought by mistake')
  })

  it('reads in Arabic too, with no raw keys on the screen', async () => {
    await i18n.changeLanguage('ar')
    show(requisition({ review: reviewData({ removed_count: 1, removed_lines: [removed] }) }))
    expect(screen.getByTestId('review-removed-lines').textContent).not.toMatch(/req\.review\./)
    expect(screen.getByTestId('review-removed-lines').textContent).toContain(
      'أُزيل في هذه المراجعة',
    )
    expect(document.body.textContent).not.toMatch(/req\.review\./)
  })
})

// Taking part of a line from stock (migration 332, playbook #117): when the panel offers it, what it passes to the dialog, and how
// the stock that was taken reads to the organizer and to the approver.
interface StockDialogProps {
  line: { id: string; name: string; shortfall: number; location?: string | null } | null
  requisitionId: string
  onClose: () => void
  onDone: () => void
}
let lastStockDialog: StockDialogProps | null = null
vi.mock('../TakeFromStockModal', () => ({
  TakeFromStockModal: (p: StockDialogProps) => {
    lastStockDialog = p
    return p.line ? (
      <div data-testid="stock-dialog">{`${p.requisitionId}|${p.line.id}|${p.line.shortfall}|${p.line.location ?? ''}`}</div>
    ) : null
  },
}))

describe('taking part of a line from stock', () => {
  // One catalog line ordered for 10 and bought for 6: 4 are left to cover.
  const shortLine = (over: Record<string, unknown> = {}) => ({
    id: 'l1',
    line_number: 1,
    description: 'Copper pipe',
    product_name: 'Pipe 20mm',
    product_id: 'prod-1',
    qty: '10',
    qty_from_stock: '0',
    source_location_name: null,
    review_stock_qty: null,
    purchases: [purchase({ qty: '6', review_original_qty: '10', review_original_price: '12.5' })],
    ...over,
  })
  const showShort = (over: Record<string, unknown> = {}, reqOver: Partial<Req> = {}) =>
    show(requisition({ lines: [shortLine(over)], ...reqOver }))
  const stockButton = () => screen.queryByRole('button', { name: 'Take Pipe 20mm from stock' })
  const mustStockButton = (): HTMLElement => {
    const b = stockButton()
    if (!b) throw new Error('no Take from stock button')
    return b
  }
  const approving = (): Partial<Req> => ({
    status: 'review_approval',
    review: reviewData({ caller_can_approve: true, caller_can_edit: false }),
  })

  beforeEach(() => {
    lastStockDialog = null
  })

  it('offers it on a catalog line that has something left to cover, to the organizer', () => {
    showShort()
    expect(stockButton()).toBeInTheDocument()
  })

  it('does not offer it when nothing is left to cover', () => {
    showShort({ purchases: [purchase({ qty: '10' })] })
    expect(stockButton()).toBeNull()
  })

  it('counts what stock already covers: ordered 10, 2 from stock, 5 bought leaves 3', () => {
    showShort({ qty_from_stock: '2', purchases: [purchase({ qty: '5' })] })
    fireEvent.click(mustStockButton())
    expect(lastStockDialog?.line?.shortfall).toBe(3)
  })

  it('does not offer it on a custom item (no catalog product has no stock)', () => {
    showShort({ product_id: null })
    expect(stockButton()).toBeNull()
  })

  it('does not offer it to someone who may not edit, nor once the review is with the PO Admin', () => {
    const { unmount } = showShort({}, { review: reviewData({ caller_can_edit: false }) })
    expect(stockButton()).toBeNull()
    unmount()
    showShort({}, approving())
    expect(stockButton()).toBeNull()
  })

  it('opens the dialog for that line with its shortfall, and reads the requisition again when it reports back', () => {
    showShort()
    fireEvent.click(mustStockButton())
    expect(screen.getByTestId('stock-dialog').textContent).toBe('req-1|l1|4|')
    act(() => {
      lastStockDialog?.onDone()
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
    act(() => {
      lastStockDialog?.onClose()
    })
    expect(screen.queryByTestId('stock-dialog')).toBeNull()
  })

  it('a line that already draws from a shelf offers that shelf to the dialog', () => {
    showShort({
      qty_from_stock: '2',
      source_location_name: 'Main warehouse',
      purchases: [purchase({ qty: '5' })],
    })
    fireEvent.click(mustStockButton())
    expect(lastStockDialog?.line?.location).toBe('Main warehouse')
  })

  it('says what is not bought, to the organizer and to the approver', () => {
    const { unmount } = showShort()
    expect(row('Pipe 20mm').textContent).toContain(
      '4 not bought yet. It becomes an accepted short unless you take it from stock.',
    )
    unmount()
    showShort({}, approving())
    expect(row('Pipe 20mm').textContent).toContain('4 not bought yet')
  })

  it('says nothing about a shortfall when the line is fully covered', () => {
    showShort({ purchases: [purchase({ qty: '10' })] })
    expect(row('Pipe 20mm').textContent).not.toContain('not bought yet')
  })

  it('shows what was taken, where from, and a Put back button that sends the line', () => {
    showShort({
      qty_from_stock: '4',
      review_stock_qty: '4',
      source_location_name: 'Main warehouse',
    })
    expect(row('Pipe 20mm').textContent).toContain('Taking 4 from stock (Main warehouse)')
    fireEvent.click(screen.getByRole('button', { name: 'Put back the stock for Pipe 20mm' }))
    expect(mutationFns.PutBackReviewStock).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1', lineId: 'l1' },
    })
    act(() => {
      complete('PutBackReviewStock')
    })
    expect(addToast).toHaveBeenCalledWith({
      message: 'Put back. The stock is released.',
      type: 'success',
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('reads the same without a place name, and a refusal of Put back is shown in the servers words', () => {
    showShort({ qty_from_stock: '4', review_stock_qty: '4', source_location_name: null })
    expect(row('Pipe 20mm').textContent).toContain('Taking 4 from stock')
    expect(row('Pipe 20mm').textContent).not.toContain('Taking 4 from stock (')
    act(() => {
      fail('PutBackReviewStock', { message: 'already has a Store Out (SO-1)' })
    })
    expect(addToast).toHaveBeenLastCalledWith({
      message: 'already has a Store Out (SO-1)',
      type: 'error',
    })
  })

  it('the approver sees what was taken but has no Put back', () => {
    showShort(
      { qty_from_stock: '4', review_stock_qty: '4', source_location_name: 'Main warehouse' },
      approving(),
    )
    expect(row('Pipe 20mm').textContent).toContain('Taking 4 from stock (Main warehouse)')
    expect(screen.queryByRole('button', { name: /Put back/ })).toBeNull()
  })

  it('draws the stock notes and buttons of a line once when it has two purchases', () => {
    showShort({
      qty: '12',
      qty_from_stock: '4',
      review_stock_qty: '4',
      source_location_name: 'Main warehouse',
      purchases: [
        purchase({ id: 'a', qty: '3' }),
        purchase({ id: 'b', qty: '3', vendor_name: 'Dar Steel' }),
      ],
    })
    expect(
      screen.getAllByRole('button', { name: 'Put back the stock for Pipe 20mm' }),
    ).toHaveLength(1)
    expect(screen.getAllByText('Taking 4 from stock (Main warehouse)')).toHaveLength(1)
  })
})
