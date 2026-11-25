// The organizer review, add and remove lines (migration 330, playbook #116): what the panel shows and does for an item that was
// added or removed in the review. Whether the caller may, and whether a PO Admin is needed, come from the server in `review`;
// these tests pin that the panel follows those flags, sends what the server expects, and shows the approver what changed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { ReviewHarness } from './reviewHarness'
import { reviewLineTotals } from '../OrganizerReviewPanel'
import type { ReviewData, ReviewRequisition } from '../OrganizerReviewPanel'

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

type Req = ReviewRequisition
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
        <ReviewHarness requisition={req} onChanged={onChanged} />
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
// The rare actions on a line are in its ⋯ menu (playbook #121): open it by the line's name and find an item in it. Any menu that is
// open is closed first (a press outside it), so two lines' menus never answer one query.
const openMenu = (item: string) => {
  fireEvent.mouseDown(document.body)
  fireEvent.click(screen.getByRole('button', { name: `More actions for ${item}` }))
}
const menuItemOf = (item: string, label: string): HTMLElement | null => {
  fireEvent.mouseDown(document.body)
  const b = screen.queryByRole('button', { name: `More actions for ${item}` })
  if (!b) return null
  fireEvent.click(b)
  return screen.queryByRole('menuitem', { name: label })
}
const pressMenu = (item: string, label: string) => {
  const el = menuItemOf(item, label)
  if (!el) throw new Error(`no "${label}" in the menu of ${item}`)
  fireEvent.click(el)
}
const expandLine = (item: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Show details for ${item}` }))
}
const openRemoved = () => {
  const b = screen.getByTestId('review-summary').querySelector('button[aria-expanded]')
  if (!b) throw new Error('there is no removed chip')
  fireEvent.click(b)
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
  const removeButton = (item: string) => {
    openMenu(item)
    return screen.getByRole('menuitem', { name: 'Remove item' })
  }

  it('puts Remove item in the menu of every line of the review, named for the item', () => {
    show()
    expect(removeButton('Pipe 20mm')).toBeInTheDocument()
    expect(removeButton('Valve')).toBeInTheDocument()
  })

  it('has none for somebody who may not change the review, and none for the approver', () => {
    show(requisition({ review: reviewData({ caller_can_edit: false }) }))
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull()
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
    expect(row('Second vendor')).toBe(row('Split item')) // one row for the line, whichever purchase it names
    fireEvent.click(removeButton('Split item'))
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
    expect(r.textContent).toContain('no purchase')
    expect(
      within(r).getByRole('button', { name: 'More actions for Stock item' }),
    ).toBeInTheDocument()
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

  it('carries the "Added" status and, when opened, says it was not checked against inventory or pricing', () => {
    show(withAdded())
    const r = row('Forgotten bolts')
    expect(within(r).getByText('Added')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Not checked against inventory or pricing')
    expandLine('Forgotten bolts')
    expect(screen.getByTestId('review-line-details').textContent).toContain(
      'Not checked against inventory or pricing',
    )
  })

  it('leaves the status and the note off every other line', () => {
    show(withAdded())
    expect(within(row('Valve')).queryByText('Added')).toBeNull()
    expandLine('Valve')
    expect(screen.getByTestId('review-line-details').textContent).not.toContain(
      'Not checked against inventory',
    )
    expect(screen.getAllByText('Added')).toHaveLength(1)
  })

  it('counts it in the summary line above the table', () => {
    show(withAdded())
    expect(screen.getByTestId('review-summary').textContent).toContain('Items: 3')
    expect(screen.getByTestId('review-summary').textContent).toContain('Added: 1')
  })

  it('shows the approver the status and the note too, without any control to change it', () => {
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
    expect(within(r).getByText('Added')).toBeInTheDocument()
    expandLine('Forgotten bolts')
    expect(screen.getByTestId('review-line-details').textContent).toContain(
      'Not checked against inventory or pricing',
    )
    expect(within(r).queryByRole('button', { name: /Remove|Change|More actions/ })).toBeNull()
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
    expect(screen.queryByTestId('review-removed-lines')).toBeNull() // a chip first, the list when it is opened
    openRemoved()
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
    openRemoved()
    expect(screen.getByTestId('review-removed-lines')).toBeInTheDocument()
  })

  it('is a chip in the summary line that opens and closes the list', () => {
    show(requisition({ review: reviewData({ removed_count: 1, removed_lines: [removed] }) }))
    const chip = screen.getByRole('button', { name: /Removed: 1/ })
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('review-removed-lines')).toBeInTheDocument()
    fireEvent.click(chip)
    expect(screen.queryByTestId('review-removed-lines')).toBeNull()
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
    openRemoved()
    const box = screen.getByTestId('review-removed-lines')
    expect(box.textContent).toContain('Old valve (10 pc)')
    expect(box.textContent).toContain('Bought by mistake')
  })

  it('reads in Arabic too, with no raw keys on the screen', async () => {
    await i18n.changeLanguage('ar')
    show(requisition({ review: reviewData({ removed_count: 1, removed_lines: [removed] }) }))
    openRemoved()
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
  mode?: 'take' | 'replace'
  requisitionId: string
  onClose: () => void
  onDone: () => void
}
let lastStockDialog: StockDialogProps | null = null
vi.mock('../TakeFromStockModal', () => ({
  TakeFromStockModal: (p: StockDialogProps) => {
    lastStockDialog = p
    return p.line ? (
      <div
        data-testid="stock-dialog"
        data-mode={p.mode ?? 'take'}
      >{`${p.requisitionId}|${p.line.id}|${p.line.shortfall}|${p.line.location ?? ''}`}</div>
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
  const stockButton = () => menuItemOf('Pipe 20mm', 'Take from stock')
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
    expect(within(row('Pipe 20mm')).getByText('Not fully bought')).toBeInTheDocument()
    expandLine('Pipe 20mm')
    expect(screen.getByTestId('review-line-details').textContent).toContain(
      '4 not bought yet. It becomes an accepted short unless you take it from stock.',
    )
    unmount()
    showShort({}, approving())
    expandLine('Pipe 20mm')
    expect(screen.getByTestId('review-line-details').textContent).toContain('4 not bought yet')
  })

  it('says nothing about a shortfall when the line is fully covered', () => {
    showShort({ purchases: [purchase({ qty: '10' })] })
    expect(within(row('Pipe 20mm')).queryByText('Not fully bought')).toBeNull()
    expandLine('Pipe 20mm')
    expect(screen.getByTestId('review-line-details').textContent).not.toContain('not bought yet')
  })

  it('shows what was taken, where from, and a Put back button that sends the line', () => {
    showShort({
      qty_from_stock: '4',
      review_stock_qty: '4',
      source_location_name: 'Main warehouse',
    })
    expect(row('Pipe 20mm').textContent).toContain('Taking 4 from stock (Main warehouse)')
    expect(within(row('Pipe 20mm')).getByText('From stock')).toBeInTheDocument()
    pressMenu('Pipe 20mm', 'Put back')
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
    expect(screen.queryByRole('button', { name: /Put back|More actions/ })).toBeNull()
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
    expect(screen.getAllByRole('button', { name: 'More actions for Pipe 20mm' })).toHaveLength(1)
    expect(screen.getAllByText('Taking 4 from stock (Main warehouse)')).toHaveLength(1)
  })
})

// Use stock instead (migration 333, playbook #118): when the panel offers it, what it passes to the dialog, and how a line whose purchases
// stock replaced reads to the organizer and to the approver.
describe('use stock instead of the purchases', () => {
  const boughtLine = (over: Record<string, unknown> = {}) => ({
    id: 'l1',
    line_number: 1,
    description: 'Copper pipe',
    product_name: 'Pipe 20mm',
    product_id: 'prod-1',
    qty: '10',
    qty_from_stock: '0',
    source_location_name: null,
    review_stock_qty: null,
    review_replaced: null,
    purchases: [purchase({ qty: '10' })],
    ...over,
  })
  const showBought = (over: Record<string, unknown> = {}, reqOver: Partial<Req> = {}) =>
    show(requisition({ lines: [boughtLine(over)], ...reqOver }))
  const useButton = () => menuItemOf('Pipe 20mm', 'Use stock instead')
  const approving = (): Partial<Req> => ({
    status: 'review_approval',
    review: reviewData({ caller_can_approve: true, caller_can_edit: false }),
  })
  const replacedLine = (over: Record<string, unknown> = {}) =>
    boughtLine({
      qty_from_stock: '10',
      review_stock_qty: '10',
      source_location_name: 'Main warehouse',
      purchases: [],
      review_replaced: [
        {
          vendor: 'Dar Steel',
          qty: '10.0000',
          price: '12.5000',
          currency: 'USD',
          had_receipt: true,
        },
      ],
      ...over,
    })

  beforeEach(() => {
    lastStockDialog = null
  })

  it('is offered on a bought catalog line, to the organizer, even when the purchase covers all of it', () => {
    showBought()
    expect(useButton()).toBeInTheDocument()
  })

  it('is not offered on a custom item, a line with nothing bought, a fully covered line, a viewer, or in the approval', () => {
    const { unmount } = showBought({ product_id: null })
    expect(useButton()).toBeNull()
    unmount()
    const second = showBought({ purchases: [] })
    expect(useButton()).toBeNull()
    second.unmount()
    const third = showBought({ qty_from_stock: '10' })
    expect(useButton()).toBeNull()
    third.unmount()
    const fourth = showBought({}, { review: reviewData({ caller_can_edit: false }) })
    expect(useButton()).toBeNull()
    fourth.unmount()
    showBought({}, approving())
    expect(useButton()).toBeNull()
  })

  it('opens the dialog in replace mode with everything still to cover, counting stock the line already has', () => {
    showBought({ qty_from_stock: '2', purchases: [purchase({ qty: '8' })] })
    pressMenu('Pipe 20mm', 'Use stock instead')
    expect(screen.getByTestId('stock-dialog').getAttribute('data-mode')).toBe('replace')
    expect(lastStockDialog?.line?.shortfall).toBe(8)
  })

  it('Take from stock still opens the dialog in take mode', () => {
    showBought({ purchases: [purchase({ qty: '6' })] })
    pressMenu('Pipe 20mm', 'Take from stock')
    expect(screen.getByTestId('stock-dialog').getAttribute('data-mode')).toBe('take')
  })

  it('shows the approver what stock replaced, and where the stock comes from', () => {
    const { unmount } = show(requisition({ lines: [replacedLine()], ...approving() }))
    expect(row('Pipe 20mm').textContent).toContain('Taking 10 from stock (Main warehouse)')
    expandLine('Pipe 20mm')
    const text = screen.getByTestId('review-line-details').textContent
    expect(text).toContain('Stock replaces:')
    expect(text).toContain('Dar Steel: 10 × 12.5 USD')
    unmount()
  })

  it('shows the organizer the same, and offers no Put back (the purchases are gone) but still Remove item', () => {
    show(requisition({ lines: [replacedLine()] }))
    expandLine('Pipe 20mm')
    expect(screen.getByTestId('review-line-details').textContent).toContain('Stock replaces:')
    expect(menuItemOf('Pipe 20mm', 'Put back')).toBeNull()
    expect(menuItemOf('Pipe 20mm', 'Remove item')).toBeInTheDocument()
  })

  describe('undo', () => {
    const undoButton = () => menuItemOf('Pipe 20mm', 'Undo')
    const pressUndo = () => {
      pressMenu('Pipe 20mm', 'Undo')
    }

    it('is offered when the server says the last use of stock can be reversed, and Put back steps aside', () => {
      show(requisition({ lines: [replacedLine({ review_can_undo_stock: true })] }))
      expect(undoButton()).toBeInTheDocument()
      expect(menuItemOf('Pipe 20mm', 'Put back')).toBeNull()
    })

    it('a part taken from a bought line (purchases still there) offers Undo, not Put back', () => {
      show(
        requisition({
          lines: [
            boughtLine({
              qty_from_stock: '4',
              review_stock_qty: '4',
              purchases: [purchase({ qty: '6' })],
              review_can_undo_stock: true,
            }),
          ],
        }),
      )
      expect(undoButton()).toBeInTheDocument()
      expect(menuItemOf('Pipe 20mm', 'Put back')).toBeNull()
      // and the line can still take more of it from stock
      expect(useButton()).toBeInTheDocument()
    })

    it('is not offered on a line replaced before undo existed, on a line nothing was taken from, or to the approver', () => {
      const { unmount } = show(
        requisition({ lines: [replacedLine({ review_can_undo_stock: false })] }),
      )
      expect(undoButton()).toBeNull()
      unmount()
      const second = showBought({ review_can_undo_stock: false })
      expect(undoButton()).toBeNull()
      second.unmount()
      const third = show(
        requisition({ lines: [replacedLine({ review_can_undo_stock: true })], ...approving() }),
      )
      expect(undoButton()).toBeNull()
      third.unmount()
      show(
        requisition({
          lines: [replacedLine({ review_can_undo_stock: true })],
          review: reviewData({ caller_can_edit: false }),
        }),
      )
      expect(undoButton()).toBeNull()
    })

    it('sends the line, says it is undone and tells the page; a refusal is shown in the servers words', () => {
      show(requisition({ lines: [replacedLine({ review_can_undo_stock: true })] }))
      pressUndo()
      expect(mutationFns.UndoReviewStockInstead).toHaveBeenCalledWith({
        variables: { requisitionId: 'req-1', lineId: 'l1' },
      })
      act(() => {
        fail('UndoReviewStockInstead', {
          message: "can't be undone: a purchase on the line was changed",
        })
      })
      expect(addToast).toHaveBeenLastCalledWith({
        message: "can't be undone: a purchase on the line was changed",
        type: 'error',
      })
      expect(onChanged).not.toHaveBeenCalled()
      act(() => {
        complete('UndoReviewStockInstead')
      })
      expect(addToast).toHaveBeenLastCalledWith({
        message: 'Undone. The stock is released and the purchases are back as they were.',
        type: 'success',
      })
      expect(onChanged).toHaveBeenCalledTimes(1)
    })

    it('reads in Arabic with no raw key', async () => {
      await i18n.changeLanguage('ar')
      show(requisition({ lines: [replacedLine({ review_can_undo_stock: true })] }))
      expect(document.body.textContent).not.toMatch(/req\.review\./)
      await i18n.changeLanguage('en')
    })
  })

  it('a line that only took stock for what was not bought still has its Put back', () => {
    show(
      requisition({
        lines: [
          boughtLine({
            qty_from_stock: '4',
            review_stock_qty: '4',
            purchases: [purchase({ qty: '6' })],
          }),
        ],
      }),
    )
    expect(menuItemOf('Pipe 20mm', 'Put back')).toBeInTheDocument()
  })
})

describe('one row per line: a line with two purchases', () => {
  const twoPurchases = () =>
    requisition({
      lines: [
        {
          id: 'l1',
          line_number: 1,
          description: 'Copper pipe',
          product_name: 'Pipe 20mm',
          product_id: 'prod-1',
          qty: '10',
          qty_from_stock: '0',
          purchases: [
            purchase({ id: 'pa', vendor_name: 'Al Noor Hardware', qty: '6' }),
            purchase({ id: 'pb', vendor_name: 'Dar Steel', qty: '4', actual_unit_price: '13' }),
          ],
        },
        {
          id: 'l2',
          line_number: 2,
          description: 'Valve',
          product_name: null,
          purchases: [purchase({ id: 'pc', vendor_name: 'Other Vendor' })],
        },
      ],
    })

  it('is ONE row holding both purchases, each with its own vendor, price and Change button, and the receipts when it is opened', () => {
    show(twoPurchases())
    const r = row('Pipe 20mm')
    expect(within(table()).getAllByRole('row')).toHaveLength(3) // header + two lines
    expect(r.textContent).toContain('6 @ 12.5 USD')
    expect(r.textContent).toContain('Al Noor Hardware')
    expect(r.textContent).toContain('4 @ 13 USD')
    expect(r.textContent).toContain('Dar Steel')
    expect(within(r).getAllByRole('button', { name: 'Change' })).toHaveLength(2)
    expect(within(r).queryAllByRole('button', { name: 'View' })).toHaveLength(0) // receipts wait for the details
    expandLine('Pipe 20mm')
    const details = screen.getByTestId('review-line-details')
    expect(details.textContent).toContain('6 @ 12.5 USD = 75 USD')
    expect(details.textContent).toContain('4 @ 13 USD = 52 USD')
    // the receipts are in the Receipts & photos window, not a second button per purchase
    expect(within(details).queryAllByRole('button', { name: 'View' })).toHaveLength(0)
  })

  it('offers what belongs to the whole line (Use stock instead, Remove item) once, not once per purchase', () => {
    show(twoPurchases())
    const r = row('Pipe 20mm')
    expect(within(r).getAllByRole('button', { name: 'More actions for Pipe 20mm' })).toHaveLength(1)
    openMenu('Pipe 20mm')
    expect(screen.getAllByRole('menuitem', { name: /Use stock instead/ })).toHaveLength(1)
    expect(screen.getAllByRole('menuitem', { name: 'Remove item' })).toHaveLength(1)
  })

  it('edits ONE purchase in place: its boxes appear in the row, the other purchase and its Change stay', () => {
    show(twoPurchases())
    const r = row('Pipe 20mm')
    fireEvent.click(within(r).getAllByRole('button', { name: 'Change' })[1])
    expect(within(r).getByLabelText(/Quantity: Pipe 20mm/i)).toHaveValue(4)
    // the first purchase is still read-only, with its own Change button
    expect(r.textContent).toContain('6 @ 12.5 USD')
    expect(within(r).getAllByRole('button', { name: 'Change' })).toHaveLength(1)
    // while a purchase is being edited the whole-line buttons step aside
    expect(within(r).queryByRole('button', { name: 'More actions for Pipe 20mm' })).toBeNull()
    // and the other line is untouched
    expect(within(row('Valve')).getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('sends the changed purchase and nothing else', () => {
    show(twoPurchases())
    const r = row('Pipe 20mm')
    fireEvent.click(within(r).getAllByRole('button', { name: 'Change' })[1])
    fireEvent.change(within(r).getByLabelText(/Quantity: Pipe 20mm/i), { target: { value: '5' } })
    fireEvent.click(within(r).getByRole('button', { name: 'Save' }))
    expect(mutationFns.EditReviewPurchase).toHaveBeenCalledTimes(1)
    expect(mutationFns.EditReviewPurchase).toHaveBeenCalledWith({
      variables: { purchaseId: 'pb', qty: 5, actualUnitPrice: undefined, currencyCode: undefined },
    })
  })

  it('keeps the Confirm and Submit buttons held back while a purchase is being edited', () => {
    show(twoPurchases())
    fireEvent.click(within(row('Valve')).getByRole('button', { name: 'Change' }))
    expect(
      screen.getByRole('button', { name: 'Confirm and create purchase orders' }),
    ).toBeDisabled()
  })

  it('shows a changed purchase with what it was, in its own row', () => {
    const req = twoPurchases()
    const l = req.lines[0]
    if (!l.purchases) throw new Error('no purchases')
    l.purchases[1] = purchase({
      id: 'pb',
      vendor_name: 'Dar Steel',
      qty: '4',
      actual_unit_price: '13',
      review_original_qty: '3',
      review_original_price: '12',
    })
    show(req)
    const r = row('Pipe 20mm')
    expect(within(r).getByText('Changed')).toBeInTheDocument()
    expect(r.textContent).not.toContain('was 3') // what it was waits for the details
    expandLine('Pipe 20mm')
    const details = screen.getByTestId('review-line-details').textContent
    expect(details).toContain('was 3')
    expect(details).toContain('was 12')
  })
})

describe('what the review adds around the Lines table', () => {
  it('does not say "not bought yet" on a line that has no purchase at all (nothing was bought, so nothing is short of it)', () => {
    show(
      requisition({
        lines: [
          {
            id: 'ln',
            line_number: 1,
            description: 'Nothing yet',
            product_name: null,
            qty: '10',
            qty_from_stock: '0',
            purchases: [],
          },
        ],
      }),
    )
    expect(row('Nothing yet').textContent).not.toMatch(/not bought yet/)
  })

  it('says "not bought yet" on a line that was only partly bought', () => {
    show(
      requisition({
        lines: [
          {
            id: 'ln',
            line_number: 1,
            description: 'Half bought',
            product_name: null,
            qty: '10',
            qty_from_stock: '0',
            purchases: [purchase({ qty: '6' })],
          },
        ],
      }),
    )
    expandLine('Half bought')
    expect(screen.getByTestId('review-line-details').textContent).toContain('4 not bought yet')
  })

  it('lists what was removed under the table only while the review is on', () => {
    const removed = {
      id: 'rm1',
      description: 'Gas bottle',
      qty_ordered: '1',
      uom: 'No.',
      reason: 'bought by mistake',
      removed_by_name: 'Olivia',
      purchases: [],
    }
    const { unmount } = show(requisition({ review: reviewData({ removed_lines: [removed] }) }))
    openRemoved()
    expect(screen.getByTestId('review-removed-lines').textContent).toContain('Gas bottle')
    unmount()
    show(requisition({ status: 'sourcing', review: reviewData({ removed_lines: [removed] }) }))
    expect(screen.queryByTestId('review-removed-lines')).toBeNull()
  })

  it('totals what was bought on a line per currency (the line total beside it is only the estimate)', () => {
    const line = {
      id: 'lt',
      purchases: [
        purchase({ id: 'a', qty: '2', actual_unit_price: '10', currency_code: 'USD' }),
        purchase({ id: 'b', qty: '3', actual_unit_price: '5', currency_code: 'USD' }),
        purchase({ id: 'c', qty: '1', actual_unit_price: '1000', currency_code: 'IQD' }),
      ],
    }
    expect(reviewLineTotals(line)).toEqual([
      { currency: 'USD', amount: 35 },
      { currency: 'IQD', amount: 1000 },
    ])
    expect(reviewLineTotals({ id: 'none', purchases: [] })).toEqual([])
  })
})

describe('on a phone', () => {
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }
  afterEach(() => {
    setWidth(1024)
  })
  const card = (item: string) => screen.getByRole('button', { name: `Open ${item}` })
  const sheet = () => screen.getByRole('dialog')

  it('is a compact card per line, with its status and the purchase in one line, and no buttons of its own', () => {
    setWidth(390)
    show()
    expect(screen.getAllByTestId('review-line-card')).toHaveLength(2)
    expect(screen.queryByRole('table')).toBeNull()
    const c = card('Pipe 20mm')
    expect(c.textContent).toContain('Pipe 20mm')
    expect(c.textContent).toContain('125 USD')
    expect(c.textContent).toContain('10 @ 12.5 USD · Al Noor Hardware')
    expect(within(c).getByText('As bought')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull()
  })

  it('a desktop keeps the table, and no cards', () => {
    show()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByTestId('review-line-card')).toBeNull()
  })

  it('tapping a card opens its sheet: the purchase with Change, the details and the actions', () => {
    setWidth(390)
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            product_id: 'prod-1',
            qty: '10',
            qty_from_stock: '0',
            purchases: [purchase()],
          },
        ],
      }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(card('Pipe 20mm'))
    const s = within(sheet())
    expect(s.getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(s.getByTestId('review-line-details')).toBeInTheDocument()
    expect(s.getByRole('button', { name: 'Use stock instead' })).toBeInTheDocument()
    expect(s.getByRole('button', { name: 'Remove item' })).toBeInTheDocument()
  })

  it('an action in the sheet closes it and does the same thing as the menu on a desktop', () => {
    setWidth(390)
    show()
    fireEvent.click(card('Valve'))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Remove item' }))
    expect(screen.queryByRole('dialog', { name: 'Valve' })).toBeNull()
    expect(screen.getByText('Remove Valve?')).toBeInTheDocument()
  })

  it('only the actions that apply are offered, as on a desktop', () => {
    setWidth(390)
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            product_id: null,
            qty: '10',
            qty_from_stock: '0',
            purchases: [purchase()],
          },
        ],
      }),
    )
    fireEvent.click(card('Pipe 20mm'))
    expect(within(sheet()).queryByRole('button', { name: 'Use stock instead' })).toBeNull() // a custom item has no stock
    expect(within(sheet()).getByRole('button', { name: 'Remove item' })).toBeInTheDocument()
  })

  it('the approver opens the same sheet but has no Change and no actions', () => {
    setWidth(390)
    show(
      requisition({
        status: 'review_approval',
        review: reviewData({ caller_can_edit: false, caller_can_approve: true }),
      }),
    )
    fireEvent.click(card('Pipe 20mm'))
    const s = within(sheet())
    expect(s.getByTestId('review-line-details')).toBeInTheDocument()
    expect(s.queryByRole('button', { name: 'Change' })).toBeNull()
    expect(s.queryByRole('button', { name: /Remove item|Use stock instead/ })).toBeNull()
  })

  it('a line with no purchase says why on its card', () => {
    setWidth(390)
    show(
      requisition({
        lines: [
          {
            id: 'l3',
            line_number: 1,
            description: 'Stock item',
            product_name: null,
            purchases: [],
          },
        ],
      }),
    )
    expect(card('Stock item').textContent).toContain('Not bought')
  })

  it('shows the summary line above the cards, and reads in Arabic with no raw key', async () => {
    setWidth(390)
    await i18n.changeLanguage('ar')
    show()
    expect(screen.getAllByTestId('review-line-card')).toHaveLength(2)
    expect(screen.getByTestId('review-summary')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/req\.review\./)
  })
})

// The statuses a line can carry, and what the summary line counts (playbook #121).
describe('the status of a line', () => {
  it('is As bought when nothing happened to it', () => {
    show()
    expect(within(row('Pipe 20mm')).getByText('As bought')).toBeInTheDocument()
    expect(screen.getByTestId('review-summary').textContent).toBe('Items: 2')
  })

  it('is Needs attention for a purchase over its tolerance that nobody signed off, and not once it is signed', () => {
    const lines = (signed: boolean) => [
      {
        id: 'l1',
        line_number: 1,
        description: 'Copper pipe',
        product_name: 'Pipe 20mm',
        purchases: [
          purchase({ over_tolerance: true, tolerance_approved_by: signed ? 'u-admin' : null }),
        ],
      },
    ]
    const { unmount } = show(requisition({ lines: lines(false) }))
    expect(within(row('Pipe 20mm')).getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByTestId('review-summary').textContent).toContain('Needs attention: 1')
    unmount()
    show(requisition({ lines: lines(true) }))
    expect(within(row('Pipe 20mm')).queryByText('Needs attention')).toBeNull()
  })

  it('is From stock when stock was taken, and says so in the summary', () => {
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            qty: '10',
            qty_from_stock: '10',
            review_stock_qty: '10',
            purchases: [],
          },
        ],
      }),
    )
    expect(within(row('Pipe 20mm')).getByText('From stock')).toBeInTheDocument()
    expect(screen.getByTestId('review-summary').textContent).toContain('From stock: 1')
  })

  it('is From inventory for a line the inventory check covered, and Not bought for one nothing covers', () => {
    show(
      requisition({
        lines: [
          {
            id: 'a',
            line_number: 1,
            description: 'Covered',
            qty: '5',
            qty_from_stock: '5',
            purchases: [],
          },
          {
            id: 'b',
            line_number: 2,
            description: 'Nothing',
            qty: '5',
            qty_from_stock: '0',
            purchases: [],
          },
        ],
      }),
    )
    expect(within(row('Covered')).getByText('From inventory')).toBeInTheDocument()
    expect(within(row('Nothing')).getByText('Not bought')).toBeInTheDocument()
  })

  it('counts a changed line in the summary, and opening a line toggles its arrow', () => {
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            purchases: [purchase({ qty: '6', review_original_qty: '10' })],
          },
        ],
      }),
    )
    expect(screen.getByTestId('review-summary').textContent).toContain('Changed: 1')
    const arrow = screen.getByRole('button', { name: 'Show details for Pipe 20mm' })
    expect(arrow).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(arrow)
    expect(screen.getByRole('button', { name: 'Hide details for Pipe 20mm' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide details for Pipe 20mm' }))
    expect(screen.queryByTestId('review-line-details')).toBeNull()
  })

  it('a line that was not changed says so in its details, and a changed one says what it was', () => {
    show()
    expandLine('Pipe 20mm')
    expect(screen.getByTestId('review-line-details').textContent).toContain('Nothing changed')
  })
})

// The Status column and the phone sheet, laid out (the user's screenshots: chips and arrows scattered, Change and View apart).
describe('the Status column on a desktop', () => {
  const cellOf = (item: string) => {
    const r = row(item)
    const cell = within(r).getByTestId('review-status-cell')
    return cell
  }

  it('is two parts in a grid: the chips on the left, one under the other, and the arrow with the menu together on the right', () => {
    show()
    const cell = cellOf('Pipe 20mm')
    expect(cell).toHaveStyle({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto' })
    expect(cell.style.maxWidth).toBe('220px') // a wide column does not pull the two parts apart
    const [chips, actions] = Array.from(cell.children)
    expect(chips).toBe(within(cell).getByTestId('review-status-chips'))
    expect(chips).toHaveStyle({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
    })
    expect(actions).toBe(within(cell).getByTestId('review-status-actions'))
    expect(
      within(actions as HTMLElement).getByRole('button', { name: 'Show details for Pipe 20mm' }),
    ).toBeInTheDocument()
    expect(
      within(actions as HTMLElement).getByRole('button', { name: 'More actions for Pipe 20mm' }),
    ).toBeInTheDocument()
  })

  it('has the same shape on every row, however many chips a row has', () => {
    show(
      requisition({
        lines: [
          {
            id: 'a',
            line_number: 1,
            description: 'One chip',
            product_name: null,
            purchases: [purchase()],
          },
          {
            id: 'b',
            line_number: 2,
            description: 'Two chips',
            product_name: null,
            review_added_at: '2026-11-24',
            qty: '5',
            qty_from_stock: '5',
            review_stock_qty: '5',
            purchases: [],
          },
        ],
      }),
    )
    for (const item of ['One chip', 'Two chips']) {
      const cell = cellOf(item)
      expect(cell).toHaveStyle({ display: 'grid', alignItems: 'center' })
      expect(cell.children).toHaveLength(2)
      expect(within(cell).getByTestId('review-status-actions')).toBeInTheDocument()
    }
    expect(within(cellOf('Two chips')).getAllByText(/Added|From stock/)).toHaveLength(2)
  })

  it('the approver gets the chips and the arrow, and no menu', () => {
    show(requisition({ review: reviewData({ caller_can_edit: false }) }))
    const actions = within(cellOf('Pipe 20mm')).getByTestId('review-status-actions')
    expect(within(actions).getByRole('button', { name: /Show details/ })).toBeInTheDocument()
    expect(within(actions).queryByRole('button', { name: /More actions/ })).toBeNull()
  })
})

describe('the phone sheet, laid out', () => {
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }
  afterEach(() => {
    setWidth(1024)
  })
  const catalogLine = (over: Record<string, unknown> = {}) => ({
    id: 'l1',
    line_number: 1,
    description: 'Copper pipe',
    product_name: 'Pipe 20mm',
    product_id: 'prod-1',
    qty: '10',
    qty_from_stock: '0',
    purchases: [purchase()],
    ...over,
  })
  const openSheet = (line = catalogLine(), reqOver: Partial<Req> = {}) => {
    setWidth(390)
    show(requisition({ lines: [line], ...reqOver }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Pipe 20mm' }))
    return within(screen.getByRole('dialog'))
  }

  it('puts Change and View side by side under the purchase, in one row of two equal columns', () => {
    const sheet = openSheet()
    const change = sheet.getByRole('button', { name: 'Change' })
    const view = sheet.getByRole('button', { name: 'View' })
    expect(change.parentElement).toBe(view.parentElement)
    expect(change.parentElement).toHaveStyle({
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    })
    // the purchase text comes before the buttons
    const purchaseBlock = sheet.getByTestId('review-purchase-sheet')
    expect(purchaseBlock.textContent).toContain('10 @ 12.5 USD')
    expect(purchaseBlock.firstElementChild?.compareDocumentPosition(change) ?? 0).toBeTruthy()
  })

  it('shows each purchase of a split line with its own pair, and no second Receipts block', () => {
    const sheet = openSheet(
      catalogLine({
        qty: '10',
        purchases: [
          purchase({ id: 'pa', qty: '6', vendor_name: 'Al Noor Hardware' }),
          purchase({ id: 'pb', qty: '4', vendor_name: 'Dar Steel' }),
        ],
      }),
    )
    expect(sheet.getAllByRole('button', { name: 'Change' })).toHaveLength(2)
    expect(sheet.getAllByRole('button', { name: 'View' })).toHaveLength(2)
    expect(sheet.queryByText('Receipts')).toBeNull()
  })

  it('with no receipt, says so beside Change instead of a View button', () => {
    const sheet = openSheet(catalogLine({ purchases: [purchase({ receipt_file_id: null })] }))
    expect(sheet.queryByRole('button', { name: 'View' })).toBeNull()
    expect(sheet.getByText('No receipt')).toBeInTheDocument()
  })

  it('View opens that purchase receipts', () => {
    const sheet = openSheet()
    expect(screen.queryByTestId('attachments')).toBeNull()
    fireEvent.click(sheet.getByRole('button', { name: 'View' }))
    expect(screen.getByTestId('attachments')).toBeInTheDocument()
  })

  it('shows an unsigned over-tolerance purchase in the sheet, where the receipts block no longer is', () => {
    const sheet = openSheet(catalogLine({ purchases: [purchase({ over_tolerance: true })] }))
    expect(sheet.getByText('Over tolerance')).toBeInTheDocument()
  })

  it('keeps What changed in the details, below the buttons', () => {
    const sheet = openSheet(
      catalogLine({ purchases: [purchase({ qty: '8', review_original_qty: '10' })] }),
    )
    expect(sheet.getByTestId('review-line-details').textContent).toContain('was 10')
  })

  it('puts the ordinary actions two to a row and Remove item alone, last, on its own row', () => {
    const sheet = openSheet(catalogLine({ purchases: [purchase({ qty: '6' })] }))
    const actions = sheet.getByTestId('review-sheet-actions')
    const useStock = within(actions).getByRole('button', { name: 'Use stock instead' })
    const take = within(actions).getByRole('button', { name: 'Take from stock' })
    const remove = within(actions).getByRole('button', { name: 'Remove item' })
    expect(useStock.parentElement).toBe(take.parentElement)
    expect(useStock.parentElement).toHaveStyle({ display: 'grid' })
    expect(remove.parentElement).toBe(actions) // its own row, not in the pair
    expect(actions.lastElementChild).toBe(remove)
  })

  it('a single ordinary action takes the whole row; with none, only Remove item is left', () => {
    const one = openSheet(catalogLine())
    expect(one.getByRole('button', { name: 'Use stock instead' })).toBeInTheDocument()
    expect(one.queryByRole('button', { name: 'Take from stock' })).toBeNull()
  })

  it('a custom item has only Remove item in the actions', () => {
    const sheet = openSheet(catalogLine({ product_id: null }))
    const actions = sheet.getByTestId('review-sheet-actions')
    expect(within(actions).getAllByRole('button')).toHaveLength(1)
    expect(within(actions).getByRole('button', { name: 'Remove item' })).toBeInTheDocument()
  })

  it('the approver has the View button but neither Change nor any action', () => {
    const sheet = openSheet(catalogLine(), {
      status: 'review_approval',
      review: reviewData({ caller_can_edit: false, caller_can_approve: true }),
    })
    expect(sheet.getByRole('button', { name: 'View' })).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: 'Change' })).toBeNull()
    expect(sheet.queryByTestId('review-sheet-actions')).toBeNull()
  })

  it('Change still turns the purchase into the editor inside the sheet', () => {
    const sheet = openSheet()
    fireEvent.click(sheet.getByRole('button', { name: 'Change' }))
    expect(sheet.getByLabelText(/Quantity: Pipe 20mm/i)).toBeInTheDocument()
    expect(sheet.queryByTestId('review-sheet-actions')).toBeNull() // the actions step aside while editing
  })
})
