// The organizer review reopened for purchase orders Finance sent back (migration 337, playbook #129). What the screen shows and offers:
// which orders came back and why, Change only on the purchases of those orders, only "Remove item" in a line's menu (no stock actions),
// no "Send back to Items Bought", the lines the fork made from the purchases hidden behind their original line. The server enforces
// all of it (po-return-to-organizer-review.test.ts); these tests pin that the screen does not offer what the server refuses.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { ReviewHarness } from './reviewHarness'
import { useOrganizerReview } from '../OrganizerReviewPanel'
import type { ReviewData, ReviewRequisition } from '../OrganizerReviewPanel'

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: () => ({ data: undefined, loading: false }),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useMutation: () => [vi.fn(), { loading: false }],
  }
})
vi.mock('../../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: () => void }) => unknown) =>
    selector({ addToast: () => undefined }),
}))
vi.mock('../../inventory/EntityAttachments', () => ({
  EntityAttachments: () => <div data-testid="attachments" />,
}))
vi.mock('../AddReviewItemModal', () => ({ AddReviewItemModal: () => null }))

const purchase = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  vendor_id: 'v-a',
  vendor_name: 'Al Noor Hardware',
  currency_code: 'USD',
  qty: '4',
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
  totals: [{ currency_code: 'USD', was: '100', now: '100', purchases: 2 }],
  ...over,
})

const reopenedPo = {
  id: 'po-a',
  po_number: 'NF-PO-2026-0201',
  vendor_id: 'v-a',
  vendor_name: 'Al Noor Hardware',
  reason: 'Invoice shows 45 USD',
  at: '2026-11-27T08:00:00Z',
}

// Line 1 is bought from vendor A (the order that came back), line 2 from vendor B (an order that did not). Line 1 has a catalog item and
// is bought for 4 of 10, so an ordinary review would offer "Take from stock" and "Use stock instead" in its menu: the fixture CAN show them.
// Line 3 is the copy the fork made from line 1's purchase: it must not appear in a reopened review.
const requisition = (reviewOver: Partial<ReviewData> = {}): ReviewRequisition => ({
  id: 'req-1',
  requisition_number: 'REQ-2026-0101',
  status: 'organizer_review',
  organizerName: 'Olivia Organizer',
  review: reviewData(reviewOver),
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
    {
      id: 'l2',
      line_number: 2,
      description: 'Valve',
      product_name: null,
      purchases: [purchase({ id: 'p2', vendor_id: 'v-b', vendor_name: 'Dar Steel' })],
    },
    {
      id: 'l3',
      line_number: 3,
      description: 'Copper pipe (PO line)',
      origin_line_id: 'l1',
      purchases: [],
    },
  ],
})

const reopened = () => requisition({ reopened_pos: [reopenedPo] })

function show(req: ReviewRequisition) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ReviewHarness requisition={req} onChanged={() => undefined} />
      </ThemeProvider>
    </MemoryRouter>,
  )
}
const row = (text: string) => {
  const r = within(screen.getByRole('table'))
    .getAllByRole('row')
    .find((x) => x.textContent.includes(text))
  if (!r) throw new Error(`no row with ${text}`)
  return r
}
const menuItemOf = (item: string, label: string): HTMLElement | null => {
  fireEvent.mouseDown(document.body)
  const b = screen.queryByRole('button', { name: `More actions for ${item}` })
  if (!b) return null
  fireEvent.click(b)
  return screen.queryByRole('menuitem', { name: label })
}

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(async () => {
  if (i18n.language !== 'en') await i18n.changeLanguage('en')
})

describe('the banner', () => {
  it('names each order that came back, its vendor and why, and what can be changed here', () => {
    show(reopened())
    const banner = screen.getByTestId('reopened-banner')
    expect(banner).toHaveTextContent('Finance sent purchase orders back to this review')
    expect(banner).toHaveTextContent('NF-PO-2026-0201 (Al Noor Hardware): Invoice shows 45 USD')
    expect(banner).toHaveTextContent('Only the purchases on these orders can be changed here')
  })

  it('is not there in an ordinary review', () => {
    show(requisition())
    expect(screen.queryByTestId('reopened-banner')).toBeNull()
  })

  it('lists every order that came back', () => {
    show(
      requisition({
        reopened_pos: [
          reopenedPo,
          {
            ...reopenedPo,
            id: 'po-b',
            po_number: 'NF-PO-2026-0202',
            vendor_id: 'v-b',
            vendor_name: 'Dar Steel',
            reason: 'Wrong qty',
          },
        ],
      }),
    )
    const banner = screen.getByTestId('reopened-banner')
    expect(banner).toHaveTextContent('NF-PO-2026-0201')
    expect(banner).toHaveTextContent('NF-PO-2026-0202 (Dar Steel): Wrong qty')
  })
})

describe('Change', () => {
  it('is offered on a purchase of an order that came back, and not on one of an order that did not', () => {
    show(reopened())
    expect(within(row('Pipe 20mm')).getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(within(row('Valve')).queryByRole('button', { name: 'Change' })).toBeNull()
  })

  it('is offered on every purchase in an ordinary review (the control for the test above)', () => {
    show(requisition())
    expect(within(row('Pipe 20mm')).getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(within(row('Valve')).getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('is not offered to someone who may not edit, even on an order that came back', () => {
    show(requisition({ reopened_pos: [reopenedPo], caller_can_edit: false }))
    expect(screen.queryAllByRole('button', { name: 'Change' })).toHaveLength(0)
  })
})

describe("a line's menu", () => {
  it('offers only Remove item in a reopened review, never the stock actions', () => {
    show(reopened())
    expect(menuItemOf('Pipe 20mm', 'Remove item')).not.toBeNull()
    expect(menuItemOf('Pipe 20mm', 'Take from stock')).toBeNull()
    expect(menuItemOf('Pipe 20mm', 'Use stock instead')).toBeNull()
  })

  it('has no menu at all for a line bought on an order that did not come back', () => {
    show(reopened())
    expect(screen.queryByRole('button', { name: 'More actions for Valve' })).toBeNull()
  })

  it('offers the stock actions in an ordinary review (so the fixture can show them)', () => {
    show(requisition())
    expect(menuItemOf('Pipe 20mm', 'Take from stock')).not.toBeNull()
    expect(menuItemOf('Pipe 20mm', 'Use stock instead')).not.toBeNull()
  })
})

describe('the bar and the controller', () => {
  it('does not offer Send back to Items Bought in a reopened review, and Confirm says it returns to Finance', () => {
    show(reopened())
    expect(screen.queryByRole('button', { name: 'Send back to Items Bought' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Confirm and return to Finance' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm and create purchase orders' })).toBeNull()
  })

  it('offers Send back to Items Bought and creating purchase orders in an ordinary review', () => {
    show(requisition())
    expect(screen.getByRole('button', { name: 'Send back to Items Bought' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Confirm and create purchase orders' }),
    ).toBeInTheDocument()
  })

  it('hides the lines the fork made from the purchases, behind their original line', () => {
    const { result } = renderHook(() => useOrganizerReview(reopened(), () => undefined))
    expect(result.current.lines.map((l) => l.id)).toEqual(['l1', 'l2'])
    const ordinary = renderHook(() => useOrganizerReview(requisition(), () => undefined))
    expect(ordinary.result.current.lines.map((l) => l.id)).toEqual(['l1', 'l2', 'l3'])
  })

  it('decides per purchase from its vendor, and refuses everything without the edit right', () => {
    const { result } = renderHook(() => useOrganizerReview(reopened(), () => undefined))
    expect(result.current.reopened).toBe(true)
    expect(result.current.canChangePurchase({ vendor_id: 'v-a' })).toBe(true)
    expect(result.current.canChangePurchase({ vendor_id: 'v-b' })).toBe(false)
    expect(result.current.canChangePurchase({ vendor_id: null })).toBe(false)
    const noEdit = renderHook(() =>
      useOrganizerReview(
        requisition({ reopened_pos: [reopenedPo], caller_can_edit: false }),
        () => undefined,
      ),
    )
    expect(noEdit.result.current.canChangePurchase({ vendor_id: 'v-a' })).toBe(false)
    const ordinary = renderHook(() => useOrganizerReview(requisition(), () => undefined))
    expect(ordinary.result.current.reopened).toBe(false)
    expect(ordinary.result.current.canChangePurchase({ vendor_id: 'v-b' })).toBe(true)
  })
})

describe('the wording says nothing new is created', () => {
  const approving = (reopenedOn: boolean): ReviewRequisition => ({
    ...requisition(),
    status: 'review_approval',
    review: reviewData({
      caller_can_edit: false,
      caller_can_approve: true,
      needs_approval: true,
      approval_reason: '1 purchase was changed',
      ...(reopenedOn ? { reopened_pos: [reopenedPo] } : {}),
    }),
  })

  it('the approver approves and returns the orders to Finance, with the hint that the numbers stay', () => {
    show(approving(true))
    expect(
      screen.getByRole('button', { name: 'Approve and return to Finance' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve and create purchase orders' })).toBeNull()
    expect(screen.getByText(/same numbers/)).toBeInTheDocument()
    expect(screen.queryByText(/Approving creates one purchase order per vendor/)).toBeNull()
  })

  it('an ordinary approval still creates purchase orders', () => {
    show(approving(false))
    expect(
      screen.getByRole('button', { name: 'Approve and create purchase orders' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Approving creates one purchase order per vendor/)).toBeInTheDocument()
  })

  it('the review intro and the confirm line say the orders return to Finance, not that they are created', () => {
    show(reopened())
    expect(
      screen.getByText(/Check each purchase on the orders Finance sent back/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Nothing was changed. Confirm and the purchase orders return to Finance.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Nothing becomes a purchase order until you confirm/)).toBeNull()
  })

  it('an ordinary review keeps its own intro', () => {
    show(requisition())
    expect(
      screen.getByText(/Nothing becomes a purchase order until you confirm/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Check each purchase on the orders Finance sent back/)).toBeNull()
  })

  it('every new string exists in English and Arabic with the same placeholders', async () => {
    const keys = [
      'barCanConfirmReopened',
      'barApprovalHintReopened',
      'barReviewHintReopened',
      'approveReopened',
      'confirmReopened',
      'toastConfirmedReopened',
      'toastApprovedReopened',
      'introReviewReopened',
      'introWaitingApprovalReopened',
      'reopenedTitle',
      'reopenedPo',
      'reopenedRules',
    ]
    for (const lng of ['en', 'ar']) {
      await i18n.changeLanguage(lng)
      for (const k of keys) {
        const text = i18n.t(`req.review.${k}`, { po: 'P', vendor: 'V', reason: 'R' })
        expect(text, `${lng} req.review.${k}`).not.toMatch(/^req\.review\./)
        expect(text, `${lng} req.review.${k}`).not.toMatch(/\{\{/)
      }
    }
    // the Arabic line names the same three things as the English one
    await i18n.changeLanguage('ar')
    const ar = i18n.t('req.review.reopenedPo', { po: 'NF-PO-1', vendor: 'VEND', reason: 'WHY' })
    expect(ar).toContain('NF-PO-1')
    expect(ar).toContain('VEND')
    expect(ar).toContain('WHY')
  })
})
