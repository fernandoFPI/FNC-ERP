// The lines Finance flagged when it sent a purchase order back to the organizer (playbook #131): in the reopened review the failing lines are
// tagged "Flagged by Finance", the reason is in plain sight on the purchase (not behind an arrow), the line stands out, and a line Finance did not
// flag looks exactly as before. The server decides which purchases carry a flag (po-return-to-organizer-review.test.ts); this is what the screen does
// with it, on a desktop and on a phone, in English and Arabic.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { ReviewHarness } from './reviewHarness'
import { financeFlaggedPurchases, reviewLineChips } from '../OrganizerReviewPanel'
import type { ReviewLineRow, ReviewRequisition } from '../OrganizerReviewPanel'

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

const FLAG = {
  finance_flag_reason: 'Invoice says 45 USD, the purchase says 40',
  finance_flagged_by: 'finance@example.com',
  finance_flagged_at: '2026-11-27T08:00:00Z',
}

// Line 1 failed Finance's check; line 2 is fine; line 3 has two purchases and only the first of them failed.
const requisition = (): ReviewRequisition => ({
  id: 'req-1',
  requisition_number: 'REQ-2026-0101',
  status: 'organizer_review',
  organizerName: 'Olivia Organizer',
  review: {
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
    reopened_pos: [
      {
        id: 'po-a',
        po_number: 'NF-PO-2026-0201',
        vendor_id: 'v-a',
        vendor_name: 'Al Noor Hardware',
        reason: 'Prices',
        at: null,
      },
    ],
  },
  lines: [
    {
      id: 'l1',
      line_number: 1,
      description: 'Copper pipe',
      product_name: null,
      purchases: [purchase(FLAG)],
    },
    {
      id: 'l2',
      line_number: 2,
      description: 'Valve',
      product_name: null,
      purchases: [purchase({ id: 'p2' })],
    },
    {
      id: 'l3',
      line_number: 3,
      description: 'Elbow',
      product_name: null,
      purchases: [
        purchase({
          id: 'p3',
          finance_flag_reason: 'Quantity is 6 on the invoice',
          finance_flagged_by: 'finance@example.com',
        }),
        purchase({ id: 'p4', vendor_name: 'Dar Steel' }),
      ],
    },
  ],
})

function show() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ReviewHarness requisition={requisition()} onChanged={() => undefined} />
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
// the element a test is about, or a clear failure (the lint rules forbid `!`)
const must = <T,>(x: T | null | undefined): T => {
  if (x == null) throw new Error('expected the element to exist')
  return x
}
const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

beforeEach(() => {
  document.body.innerHTML = ''
  setWidth(1440)
})
afterEach(async () => {
  setWidth(1440)
  if (i18n.language !== 'en')
    await act(async () => {
      await i18n.changeLanguage('en')
    })
})

describe('the rules', () => {
  it('a purchase is flagged only when Finance gave a reason', () => {
    const lines: ReviewLineRow[] = requisition().lines
    expect(financeFlaggedPurchases(lines[0]).map((p) => p.id)).toEqual(['p1'])
    expect(financeFlaggedPurchases(lines[1])).toEqual([])
    expect(financeFlaggedPurchases(lines[2]).map((p) => p.id)).toEqual(['p3'])
    expect(financeFlaggedPurchases({ id: 'x', purchases: null } as ReviewLineRow)).toEqual([])
    expect(
      financeFlaggedPurchases({
        id: 'x',
        purchases: [purchase({ finance_flag_reason: '' })],
      } as ReviewLineRow),
    ).toEqual([])
  })

  it('puts the Finance flag before every other status of the line', () => {
    const lines: ReviewLineRow[] = requisition().lines
    expect(reviewLineChips(lines[0])[0]).toBe('financeFlagged')
    expect(reviewLineChips(lines[1])).not.toContain('financeFlagged')
  })
})

describe('on a desktop', () => {
  it('tags the failing line and shows the reason and who flagged it right on the purchase', () => {
    show()
    const r = row('Copper pipe')
    expect(within(r).getByText('Flagged by Finance')).toBeInTheDocument()
    const note = within(r).getByTestId('finance-flag-note')
    expect(note).toHaveTextContent('Flagged by Finance (finance@example.com)')
    expect(note).toHaveTextContent('Invoice says 45 USD, the purchase says 40')
  })

  it('leaves a line Finance did not flag exactly as it was', () => {
    show()
    const r = row('Valve')
    expect(within(r).queryByTestId('finance-flag-note')).toBeNull()
    expect(within(r).queryByText('Flagged by Finance')).toBeNull()
    expect(within(r).getByText('As bought')).toBeInTheDocument()
  })

  it('shows the note only under the purchase that failed when a line has two', () => {
    show()
    const r = row('Elbow')
    const notes = within(r).getAllByTestId('finance-flag-note')
    expect(notes).toHaveLength(1)
    expect(notes[0]).toHaveTextContent('Quantity is 6 on the invoice')
    // it sits inside the first purchase, not the second
    const purchases = within(r).getAllByTestId('review-purchase')
    expect(within(purchases[0]).getByTestId('finance-flag-note')).toBeInTheDocument()
    expect(within(purchases[1]).queryByTestId('finance-flag-note')).toBeNull()
  })

  it('keeps the reason visible while the line is closed, and Change still works on it', () => {
    show()
    const r = row('Copper pipe')
    expect(within(r).getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(within(r).getByTestId('finance-flag-note')).toBeVisible()
  })
})

describe('on a phone', () => {
  it('marks the failing card and shows the reason on it, and not on the others', () => {
    setWidth(390)
    show()
    const cards = screen.getAllByTestId('review-line-card')
    expect(cards).toHaveLength(3)
    const pipe = must(cards.find((c) => c.textContent.includes('Copper pipe')))
    expect(within(pipe).getByText('Flagged by Finance')).toBeInTheDocument()
    expect(within(pipe).getByTestId('finance-flag-card-reason')).toHaveTextContent(
      'Invoice says 45 USD, the purchase says 40',
    )
    const valve = must(cards.find((c) => c.textContent.includes('Valve')))
    // the failing card stands out from a plain one: its edge and its fill are not the plain card's
    expect(pipe.style.borderColor).not.toBe('')
    expect(pipe.style.borderColor).not.toBe(valve.style.borderColor)
    expect(pipe.style.background).not.toBe(valve.style.background)
    expect(within(valve).queryByTestId('finance-flag-card-reason')).toBeNull()
    expect(within(valve).queryByText('Flagged by Finance')).toBeNull()
  })

  it('shows the note again in the sheet that opens from the card', () => {
    setWidth(390)
    show()
    const pipe = must(
      screen.getAllByTestId('review-line-card').find((c) => c.textContent.includes('Copper pipe')),
    )
    fireEvent.click(pipe)
    expect(screen.getByTestId('finance-flag-note')).toHaveTextContent(
      'Invoice says 45 USD, the purchase says 40',
    )
  })
})

describe('in Arabic', () => {
  it('reads in Arabic with no raw key, and keeps the reason Finance wrote as it was written', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    const { container } = show()
    expect(container.textContent).not.toMatch(/req\.review\./)
    const note = within(row('Copper pipe')).getByTestId('finance-flag-note')
    expect(note.textContent).toContain('Invoice says 45 USD, the purchase says 40')
    expect(note.textContent).toContain('finance@example.com')
    expect(note.textContent).toContain('علّمته المالية')
  })
})
