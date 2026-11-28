// The requisition page during the organizer review (migration 329, playbook #115): the review panel is drawn in the two review
// statuses and only then, its action bar is the LAST thing on the page (a sticky bar pins only at the end), the status reads in
// words, and the Lines table still shows what was bought. The panel's own behaviour is in components/procurement/__tests__.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, within, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useMutation: () => [vi.fn().mockResolvedValue({}), { loading: false }],
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})
vi.mock('../../../../store/toastStore', () => ({
  useToastStore: (selector?: (s: { addToast: () => void }) => unknown) =>
    selector ? selector({ addToast: vi.fn() }) : vi.fn(),
}))
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: { id: 'user-organizer', role: 'user' } }),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: 'req-1' }) }
})
vi.mock('../../../../components/inventory/EntityAttachments', () => ({
  EntityAttachments: () => <div data-testid="attachments" />,
}))

const REVIEW = {
  needs_approval: false,
  approval_reason: null,
  edited_count: 0,
  organizer_bought_count: 0,
  unsigned_tolerance_count: 0,
  caller_can_edit: true,
  caller_can_approve: false,
  last_rejection: null,
  totals: [{ currency_code: 'USD', was: '125', now: '125', purchases: 1 }],
}

// A test can change what the one line looks like (reset in beforeEach).
let lineOver: Record<string, unknown> = {}
function line() {
  return {
    ...lineBase(),
    ...lineOver,
  }
}
function lineBase() {
  return {
    id: 'line-1',
    line_number: 1,
    description: 'Pipe 2in',
    product_id: null,
    product_name: null,
    sku: null,
    qty: '10',
    uom: 'pc',
    currency_code: 'USD',
    unit_price: '12.5',
    qty_from_stock: '0',
    store_price: null,
    market_price: '12.5',
    market_price_currency: 'USD',
    verified_price: '12.5',
    verified_price_currency: 'USD',
    total: '125',
    owner_handles: false,
    purchases: [
      {
        id: 'p1',
        vendor_id: 'v1',
        vendor_name: 'Al Noor Hardware',
        currency_code: 'USD',
        qty: '10',
        actual_unit_price: '12.5',
        bought_at: '2026-11-20T10:00:00.000Z',
        bought_by: 'user-buyer',
        bought_by_name: 'Bassam Buyer',
        over_tolerance: false,
        tolerance_approved_by: null,
        receipt_file_id: 'f1',
        review_original_qty: null,
        review_original_price: null,
      },
    ],
  }
}

function mockReq(status: string, review: unknown) {
  mockUseQuery.mockImplementation(
    (doc: unknown, opts?: { variables?: Record<string, unknown> }) => {
      const op = (
        doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
      ).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      if (op === 'POLineComments')
        return { data: { poLineComments: [] }, loading: false, refetch: vi.fn() }
      if (op === 'RequisitionChildPurchaseOrders')
        return { data: { requisitionChildPurchaseOrders: [] }, loading: false, refetch: vi.fn() }
      if (op === 'MaterialIssues')
        return { data: { materialIssues: [] }, loading: false, refetch: vi.fn() }
      if (op === 'RequisitionStockAvailability')
        return { data: { requisitionStockAvailability: [] }, loading: false, refetch: vi.fn() }
      if (opts?.variables && 'isActive' in opts.variables)
        return { data: { stockLocations: [] }, loading: false, refetch: vi.fn() }
      return {
        data: {
          requisition: {
            id: 'req-1',
            requisition_number: 'REQ-2026-001',
            status,
            priority: 'low',
            purpose: 'stock',
            delivery_destination: 'inventory',
            project_id: null,
            projectCode: null,
            projectName: null,
            branch_id: null,
            branch_name: null,
            organizer_id: 'user-organizer',
            organizerName: 'Olivia Organizer',
            notes: null,
            created_at: '2026-01-15T10:00:00.000Z',
            updated_at: '2026-01-15T10:00:00.000Z',
            callerHasStoreKeeperPosition: false,
            callerHasStorePricingPosition: false,
            callerHasMarketPricingPosition: false,
            callerHasPriceVerificationPosition: false,
            callerHasBuyerPosition: false,
            callerCanApprove: false,
            currencyTotals: [{ currency_code: 'USD', subtotal: '125', line_count: 1 }],
            lines: [line()],
            approval_log: [],
            edit_requests: [],
            review,
          },
        },
        loading: false,
        refetch: vi.fn(),
      }
    },
  )
}

async function open(status: string, review: unknown = REVIEW) {
  mockReq(status, review)
  const RequisitionDetail = (await import('../RequisitionDetail')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/req-1']}>
      <ThemeProvider>
        <RequisitionDetail />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  lineOver = {}
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(async () => {
  if (i18n.language !== 'en')
    await act(async () => {
      await i18n.changeLanguage('en')
    })
})

describe('the requisition page in the organizer review', () => {
  it('draws the review in organizer_review, with the purchases and the Confirm button', async () => {
    await open('organizer_review')
    expect(screen.getByText('Review what was bought')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Confirm and create purchase orders' }),
    ).toBeInTheDocument()
    // the status reads in words
    expect(screen.getAllByText('Organizer review').length).toBeGreaterThan(0)
  })

  it("draws the PO Admin's approval in review_approval", async () => {
    await open('review_approval', {
      ...REVIEW,
      caller_can_edit: false,
      caller_can_approve: true,
      needs_approval: true,
    })
    expect(screen.getByText('Next step: approve the changes')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Approve and create purchase orders' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Re-approval').length).toBeGreaterThan(0)
  })

  describe('flagging lines for the organizer', () => {
    const approver = {
      ...REVIEW,
      caller_can_edit: false,
      caller_can_approve: true,
      needs_approval: true,
    }
    const flagBoxes = () => screen.queryAllByRole('checkbox', { name: /flag this line/i })

    it('the approver gets a tick box on every line, and a reason box once one is ticked', async () => {
      await open('review_approval', approver)
      const boxes = flagBoxes()
      expect(boxes).toHaveLength(1)
      fireEvent.click(boxes[0])
      expect(flagBoxes()[0]).toBeChecked()
      expect(screen.getByPlaceholderText('Say what the organizer has to fix')).toBeInTheDocument()
    })

    it('sends the ticked line and its reason with the send back', async () => {
      await open('review_approval', approver)
      fireEvent.click(flagBoxes()[0])
      fireEvent.change(screen.getByPlaceholderText('Say what the organizer has to fix'), {
        target: { value: 'Price looks wrong' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Send back to the organizer' }))
      const dialog = screen.getByRole('dialog', { name: /Send the changes back to/ })
      expect(within(dialog).getByTestId('review-reject-flags').textContent).toContain(
        'Price looks wrong',
      )
      expect(within(dialog).getByRole('button', { name: 'Send back' })).toBeEnabled()
    })

    it('nobody else gets the boxes: the organizer in his review, and a viewer who cannot approve', async () => {
      await open('organizer_review')
      expect(flagBoxes()).toHaveLength(0)
      cleanup()
      await open('review_approval', {
        ...REVIEW,
        caller_can_edit: false,
        caller_can_approve: false,
      })
      expect(flagBoxes()).toHaveLength(0)
    })

    it('the other stages keep their own tick box (price verification still flags)', async () => {
      await open('price_verification', null)
      expect(flagBoxes().length).toBeGreaterThan(0)
    })
  })

  it.each(['draft', 'pending_approval', 'approved', 'items_bought', 'sourcing', 'completed'])(
    'does not draw the review in %s, even if the server sent one',
    async (status) => {
      await open(status)
      expect(screen.queryByText('Review what was bought')).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'Confirm and create purchase orders' }),
      ).toBeNull()
    },
  )

  it('puts the action bar AFTER the tabs and the lines, as the last thing on the page, so it can stick to the bottom', async () => {
    await open('organizer_review')
    const confirm = screen.getByRole('button', { name: 'Confirm and create purchase orders' })
    const logTab = screen.getByRole('button', { name: /^Log/ })
    expect(logTab.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // and the review's own table comes before the tabs, so the organizer sees what he is checking first
    const heading = screen.getByText('Review what was bought')
    expect(heading.compareDocumentPosition(logTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is the Lines table that holds the review: one row per line with its purchase, Change, a status and a ⋯ menu', async () => {
    await open('organizer_review')
    // there is no second table: the line's row carries the purchase (vendor, quantity, price) and what can be done to it
    expect(screen.getAllByRole('table')).toHaveLength(1)
    const row = screen.getByText('Pipe 2in').closest('tr')
    if (!row) throw new Error('no row')
    expect(row.textContent).toContain('10 @ 12.5 USD')
    expect(row.textContent).toContain('Al Noor Hardware')
    expect(within(row).getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(within(row).getByText('As bought')).toBeInTheDocument()
    expect(
      within(row).getByRole('button', { name: 'More actions for Pipe 2in' }),
    ).toBeInTheDocument()
    // what the status hides is one arrow away: the receipts, what changed
    expect(within(row).queryByRole('button', { name: 'View' })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Show details for Pipe 2in' }))
    expect(screen.getByTestId('review-line-details').textContent).toContain(
      '10 @ 12.5 USD = 125 USD',
    )
    // one way to the receipts on a desktop: the Receipts & photos window, not a View button per purchase
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
  })

  it('opens the ⋯ menu with the rare actions, and Remove item is one of them', async () => {
    await open('organizer_review')
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Pipe 2in' }))
    expect(screen.getByRole('menuitem', { name: 'Remove item' })).toBeInTheDocument()
  })

  it('says how many items there are above the table', async () => {
    await open('organizer_review')
    expect(screen.getByTestId('review-summary').textContent).toContain('Items: 1')
  })

  it('does not show the store-price double-check during the review (it belongs to the inventory check)', async () => {
    lineOver = {
      product_id: 'prod-1',
      product_name: 'Pipe 2in',
      qty_from_stock: '4',
      cost_stale: true,
      cost_age_days: 154,
    }
    await open('organizer_review')
    expect(screen.queryByText('Double-check the store price')).toBeNull()
    expect(screen.queryByTestId('stale-cost-tag')).toBeNull()
  })

  it('still shows the store-price double-check at the stages it belongs to (so the test above proves something)', async () => {
    lineOver = {
      product_id: 'prod-1',
      product_name: 'Pipe 2in',
      qty_from_stock: '4',
      cost_stale: true,
      cost_age_days: 154,
    }
    await open('sourcing')
    expect(screen.getByText('Double-check the store price')).toBeInTheDocument()
  })

  describe('on a phone', () => {
    const setWidth = (w: number) => {
      Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
    }
    afterEach(() => {
      setWidth(1024)
    })

    it('shows a compact card per line instead of the table, with the summary above and no Columns button', async () => {
      setWidth(390)
      await open('organizer_review')
      expect(screen.queryByRole('table')).toBeNull()
      expect(screen.getAllByTestId('review-line-card')).toHaveLength(1)
      expect(screen.getByTestId('review-summary').textContent).toContain('Items: 1')
      expect(screen.queryByRole('button', { name: /Columns/ })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    })

    it('a tap opens the sheet with Change, the details and the actions', async () => {
      setWidth(390)
      await open('organizer_review')
      fireEvent.click(screen.getByRole('button', { name: 'Open Pipe 2in' }))
      const sheet = within(screen.getByRole('dialog'))
      expect(sheet.getByRole('button', { name: 'Change' })).toBeInTheDocument()
      expect(sheet.getByTestId('review-line-details')).toBeInTheDocument()
      expect(sheet.getByRole('button', { name: 'Remove item' })).toBeInTheDocument()
    })

    it('the Next step bar can be folded down to its title, in the review and in the approval', async () => {
      setWidth(390)
      const { unmount } = await open('organizer_review')
      const bar = () => screen.getByRole('region', { name: /next step/i })
      expect(within(bar()).getByRole('button', { name: /confirm|submit/i })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Fold this step away' }))
      expect(within(bar()).queryByRole('button', { name: /confirm|submit/i })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Show this step' }))
      expect(within(bar()).getByRole('button', { name: /confirm|submit/i })).toBeInTheDocument()
      unmount()
      await open('review_approval', {
        ...REVIEW,
        caller_can_edit: false,
        caller_can_approve: true,
        needs_approval: true,
      })
      expect(screen.getByRole('button', { name: 'Fold this step away' })).toBeInTheDocument()
    })

    it('every other stage keeps its own table on a phone', async () => {
      setWidth(390)
      await open('sourcing')
      expect(screen.queryByTestId('review-line-card')).toBeNull()
    })
  })

  it('shows what was bought in the Total column, not the estimate beside it', async () => {
    lineOver = { total: '999' }
    await open('organizer_review')
    const row = screen.getByText('Pipe 2in').closest('tr')
    if (!row) throw new Error('no row')
    expect(row.textContent).toContain('125 USD')
    expect(row.textContent).not.toContain('999')
  })

  it('keeps the estimate in the Total column once the review is over', async () => {
    lineOver = { total: '999' }
    await open('sourcing')
    const row = screen.getByText('Pipe 2in').closest('tr')
    if (!row) throw new Error('no row')
    expect(row.textContent).toContain('999 USD')
  })

  it('lists what was removed behind a chip above the Lines table', async () => {
    await open('organizer_review', {
      ...REVIEW,
      removed_lines: [
        {
          id: 'rm1',
          description: 'Gas bottle',
          qty_ordered: '1',
          uom: 'No.',
          reason: 'bought by mistake',
          removed_by_name: 'Olivia',
          purchases: [],
        },
      ],
    })
    expect(screen.queryByTestId('review-removed-lines')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Removed: 1/ }))
    const box = screen.getByTestId('review-removed-lines')
    expect(box.textContent).toContain('Gas bottle')
    const row = screen.getByText('Pipe 2in').closest('tr')
    if (!row) throw new Error('no row')
    // the list is part of the summary above the table now, not a block under it
    expect(row.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('shows the same row to someone who cannot edit: the status and its details, without Change or the menu', async () => {
    await open('organizer_review', { ...REVIEW, caller_can_edit: false })
    const row = screen.getByText('Pipe 2in').closest('tr')
    if (!row) throw new Error('no row')
    expect(row.textContent).toContain('10 @ 12.5 USD')
    expect(within(row).queryByRole('button', { name: 'Change' })).toBeNull()
    expect(within(row).queryByRole('button', { name: /More actions/ })).toBeNull()
    expect(within(row).getByText('As bought')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Show details for Pipe 2in' }))
    expect(screen.getByTestId('review-line-details')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
  })

  it.each(['organizer_review', 'review_approval'])(
    'keeps bought and the status column in %s, and starts without handled by, from stock, notes or the earlier pricing columns',
    async (status) => {
      await open(
        status,
        status === 'review_approval'
          ? { ...REVIEW, caller_can_edit: false, caller_can_approve: true }
          : REVIEW,
      )
      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
      for (const h of ['Item', 'Qty', 'Bought', 'Status', 'Total']) expect(headers, h).toContain(h)
      for (const h of [
        'Handled by',
        'From stock',
        'Notes',
        'Store price',
        'Market price',
        'Verified price',
      ])
        expect(headers, h).not.toContain(h)
      // the Columns menu still offers every one of them, so one click brings them back
      fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
      for (const h of [
        'Handled by',
        'From stock',
        'Notes',
        'Store price',
        'Market price',
        'Verified price',
      ])
        expect(screen.getAllByText(h).length, h).toBeGreaterThan(0)
    },
  )

  it('shows the review column to the organizer and not the pricing ones, and cannot switch Bought or Review off', async () => {
    await open('organizer_review')
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    const boughtBox = screen.getByRole('checkbox', { name: /^Bought$/ })
    expect(boughtBox).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /^Status$/ })).toBeDisabled()
  })

  it.each(['items_bought', 'sourcing', 'completed'])(
    'leaves the Lines table as it was in %s: every pricing column, plain purchases and no review column',
    async (status) => {
      await open(status)
      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
      for (const h of [
        'Handled by',
        'From stock',
        'Store price',
        'Market price',
        'Verified price',
        'Bought',
      ])
        expect(headers, h).toContain(h)
      expect(headers).not.toContain('Status')
      expect(screen.getByText(/^10 @ 12.5 USD — Al Noor Hardware/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    },
  )

  describe('the receipts window', () => {
    const setWidth = (w: number) => {
      Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
    }
    afterEach(() => {
      setWidth(1024)
    })

    it.each(['organizer_review', 'review_approval'])(
      'is offered beside the summary in %s, and opens the requisition viewer',
      async (status) => {
        const popup = vi
          .spyOn(window, 'open')
          // closed, so the next case opens its own window (an open one is brought forward, not opened again)
          .mockReturnValue({ closed: true, focus: vi.fn() } as unknown as Window)
        await open(status)
        const button = screen.getByRole('button', { name: 'Receipts & photos ↗' })
        const strip = screen.getByTestId('review-summary').parentElement
        if (!strip) throw new Error('no strip')
        expect(within(strip).getByRole('button', { name: 'Receipts & photos ↗' })).toBe(button)
        fireEvent.click(button)
        // the floating window is tried first (asynchronously); without one the pop-up opens
        await waitFor(() => {
          expect(popup).toHaveBeenCalledTimes(1)
        })
        expect(popup.mock.calls[0][0]).toBe('/viewer/requisitions/req-1/photos')
        popup.mockRestore()
      },
    )

    it('is not offered on a phone (it cannot float there)', async () => {
      setWidth(390)
      await open('organizer_review')
      expect(screen.queryByRole('button', { name: 'Receipts & photos ↗' })).toBeNull()
    })

    it('is not offered once the review is over', async () => {
      await open('sourcing', null)
      expect(screen.queryByRole('button', { name: 'Receipts & photos ↗' })).toBeNull()
    })
  })

  it('offers no "Go to Items Bought" any more once the buying is finished', async () => {
    await open('organizer_review')
    expect(screen.queryByRole('button', { name: /go to items bought/i })).toBeNull()
  })

  it('reads in Arabic with no raw key on the page', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    await open('organizer_review')
    expect(screen.getByText('راجع ما تم شراؤه')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/req\.(review|status|detail)\./)
  })
})

describe('a line Finance flagged when it sent its purchase order back (playbook #131)', () => {
  const flagged = () => {
    const [first] = lineBase().purchases
    return {
      purchases: [
        {
          ...first,
          finance_flag_reason: 'Invoice says 45 USD',
          finance_flagged_by: 'finance@example.com',
          finance_flagged_at: '2026-11-27T08:00:00Z',
        },
      ],
    }
  }
  const rowOfPipe = () => {
    const r = screen.getByText('Pipe 2in').closest('tr')
    if (!r) throw new Error('no row')
    return r
  }

  it('highlights the failing row in red, tags it and shows the reason on the purchase', async () => {
    lineOver = flagged()
    await open('organizer_review')
    const r = rowOfPipe()
    expect(within(r).getByText('Flagged by Finance')).toBeInTheDocument()
    expect(within(r).getByTestId('finance-flag-note')).toHaveTextContent('Invoice says 45 USD')
    expect(r.getAttribute('style') ?? '').toMatch(/border-inline-start: 4px solid/)
    expect(r.getAttribute('style') ?? '').toMatch(/background/)
  })

  it('leaves the row plain when Finance did not flag it (the control for the test above)', async () => {
    await open('organizer_review')
    const r = rowOfPipe()
    expect(within(r).queryByText('Flagged by Finance')).toBeNull()
    expect(r.getAttribute('style') ?? '').not.toMatch(/border-inline-start: 4px solid/)
  })

  it('does not highlight outside the review, even if a flag is still on the purchase', async () => {
    lineOver = flagged()
    await open('sourcing', null)
    const r = rowOfPipe()
    expect(within(r).queryByText('Flagged by Finance')).toBeNull()
    expect(r.getAttribute('style') ?? '').not.toMatch(/border-inline-start: 4px solid/)
  })
})
