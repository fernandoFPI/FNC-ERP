// The organizer review panel (migration 329, playbook #115): what the organizer sees between Items Bought and Sourcing, what he
// can change, which button the server's flags put in the action bar, and the two dialogs. The rules (who may, whether a PO Admin is
// needed) come from the server in `review`; these tests pin that the panel follows those flags and keeps no rule of its own.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { ReviewHarness } from './reviewHarness'
import type { ReviewData, ReviewRequisition } from '../OrganizerReviewPanel'

// ── Apollo: every mutation is a vi.fn keyed by its operation name; its options are kept so a test can finish it ──
const mutationFns: Record<string, ReturnType<typeof vi.fn>> = {}
interface MutationOptions {
  onCompleted?: (d?: unknown) => void
  onError?: (e: { message: string }) => void
}
const mutationOptions: Record<string, MutationOptions | undefined> = {}
// Finish (or fail) the mutation the page started, the way Apollo would.
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

// The receipts window is the shared attachments component; here it only has to be asked for the right record, read-only.
vi.mock('../../inventory/EntityAttachments', () => ({
  EntityAttachments: (p: { entityType: string; entityId: string; readOnly?: boolean }) => (
    <div data-testid="attachments">{`${p.entityType}:${p.entityId}:${p.readOnly ? 'readonly' : 'editable'}`}</div>
  ),
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
      purchases: [
        purchase({
          id: 'p2',
          vendor_name: 'Dar Steel',
          actual_unit_price: '12.5',
          bought_by_name: 'Carl',
        }),
      ],
    },
  ],
  ...over,
})

const onChanged = vi.fn()
function show(req: Req = requisition(), extra: { barSlot?: HTMLElement | null } = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ReviewHarness requisition={req} onChanged={onChanged} {...extra} />
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
const button = (name: string | RegExp) => screen.getByRole('button', { name })

beforeEach(() => {
  for (const k of Object.keys(mutationFns)) Reflect.deleteProperty(mutationFns, k)
  for (const k of Object.keys(mutationOptions)) Reflect.deleteProperty(mutationOptions, k)
  addToast.mockClear()
  onChanged.mockClear()
})
afterEach(async () => {
  if (i18n.language !== 'en') await i18n.changeLanguage('en')
})

describe('what the organizer sees', () => {
  it('draws nothing when the server sent no review', () => {
    show(requisition({ review: null }))
    // no card, no bar and no review buttons: only the plain lines
    expect(screen.queryByText('Review what was bought')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add an item' })).toBeNull()
  })

  it('names the step, says nothing becomes a purchase order until he confirms, and lists each purchase with its total', () => {
    show()
    expect(screen.getByText('Review what was bought')).toBeInTheDocument()
    expect(
      screen.getByText(/Nothing becomes a purchase order until you confirm/),
    ).toBeInTheDocument()
    const first = row('Pipe 20mm')
    expect(first.textContent).toContain('Al Noor Hardware')
    expect(first.textContent).toContain('10 @ 12.5 USD')
    expect(first.textContent).toContain('Bassam Buyer')
    // a line with no catalogue product shows its description
    expect(row('Valve').textContent).toContain('Dar Steel')
    // the purchase's own total is in its details
    fireEvent.click(button('Show details for Pipe 20mm'))
    expect(screen.getByTestId('review-line-details').textContent).toContain('= 125 USD') // 10 x 12.5
  })

  it('shows a changed purchase with a Changed badge and what it was, under the new quantity and price', () => {
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            purchases: [
              purchase({
                qty: '8',
                actual_unit_price: '13',
                review_original_qty: '10',
                review_original_price: '12.5',
              }),
            ],
          },
        ],
        review: reviewData({
          totals: [{ currency_code: 'USD', was: '125', now: '104', purchases: 1 }],
        }),
      }),
    )
    const r = row('Pipe 20mm')
    expect(within(r).getByText('Changed')).toBeInTheDocument()
    expect(r.textContent).toContain('8 @ 13 USD')
    fireEvent.click(button('Show details for Pipe 20mm'))
    const details = screen.getByTestId('review-line-details').textContent
    expect(details).toContain('was 10')
    expect(details).toContain('was 12.5')
    expect(details).toContain('= 104 USD')
  })

  it('shows the totals per currency, "was" and "now" only when they differ, and never adds currencies together', () => {
    show(
      requisition({
        review: reviewData({
          totals: [
            { currency_code: 'IQD', was: '1500000', now: '1500000', purchases: 1 },
            { currency_code: 'USD', was: '250', now: '255', purchases: 2 },
          ],
        }),
      }),
    )
    expect(screen.getByText('1,500,000 IQD')).toBeInTheDocument()
    expect(screen.getByText('was 250, now 255 USD')).toBeInTheDocument()
    expect(screen.queryByText(/1,500,250/)).toBeNull()
  })

  it('marks a purchase with no receipt, and an over-tolerance one', () => {
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            purchases: [purchase({ receipt_file_id: null, over_tolerance: true })],
          },
        ],
      }),
    )
    // the status says it needs a look; the receipt and the tolerance flag are in the details
    expect(within(row('Pipe 20mm')).getByText('Needs attention')).toBeInTheDocument()
    fireEvent.click(button('Show details for Pipe 20mm'))
    const details = within(screen.getByTestId('review-line-details'))
    expect(details.getByText('No receipt')).toBeInTheDocument()
    expect(details.getByText('Over tolerance')).toBeInTheDocument()
  })

  it('says why it came back when a PO Admin sent it back, with who and the reason', () => {
    show(
      requisition({
        review: reviewData({
          last_rejection: {
            reason: 'The price is too high, ask again',
            by_name: 'Paula Admin',
            at: '2026-11-22',
          },
        }),
      }),
    )
    const note = screen.getByRole('status')
    expect(note.textContent).toContain('Sent back by Paula Admin:')
    expect(note.textContent).toContain('The price is too high, ask again')
  })

  it('says why a PO Admin is needed, in words from the server', () => {
    show(
      requisition({
        review: reviewData({ needs_approval: true, approval_reason: '1 purchase was changed' }),
      }),
    )
    expect(
      screen.getByText('A PO Admin has to approve this: 1 purchase was changed.'),
    ).toBeInTheDocument()
  })
})

describe('changing a purchase', () => {
  const openEdit = (text: string) => {
    fireEvent.click(within(row(text)).getByRole('button', { name: 'Change' }))
  }
  const qtyBox = () =>
    screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Quantity: Pipe 20mm' })
  const priceBox = () =>
    screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Unit price: Pipe 20mm' })

  it('gives every row a Change button, to the organizer', () => {
    show()
    expect(within(table()).getAllByRole('button', { name: 'Change' })).toHaveLength(2)
  })

  it('gives none to someone who may not edit, and none once a PO Admin holds it', () => {
    const { unmount } = show(requisition({ review: reviewData({ caller_can_edit: false }) }))
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    unmount()
    show(requisition({ status: 'review_approval', review: reviewData({ caller_can_edit: true }) }))
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
  })

  it('opens two boxes named for the item, starting from the current values', () => {
    show()
    openEdit('Pipe 20mm')
    expect(qtyBox().value).toBe('10')
    expect(priceBox().value).toBe('12.5')
    expect(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('sends only what changed: a new price alone is sent without a quantity', () => {
    show()
    openEdit('Pipe 20mm')
    fireEvent.change(priceBox(), { target: { value: '12.9' } })
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
    expect(mutationFns.EditReviewPurchase).toHaveBeenCalledTimes(1)
    expect(mutationFns.EditReviewPurchase).toHaveBeenCalledWith({
      variables: { purchaseId: 'p1', qty: undefined, actualUnitPrice: 12.9 },
    })
  })

  it('can move a purchase to another currency: the box starts on its own currency and only a changed one is sent', () => {
    show()
    openEdit('Pipe 20mm')
    const box = () =>
      screen.getByRole<HTMLSelectElement>('combobox', { name: 'Currency: Pipe 20mm' })
    expect(box().value).toBe('USD')
    // nothing else changed and the currency left alone: closes without asking
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
    expect(mutationFns.EditReviewPurchase).not.toHaveBeenCalled()
    openEdit('Pipe 20mm')
    fireEvent.change(box(), { target: { value: 'IQD' } })
    fireEvent.change(priceBox(), { target: { value: '18000' } })
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
    expect(mutationFns.EditReviewPurchase).toHaveBeenCalledWith({
      variables: { purchaseId: 'p1', qty: undefined, actualUnitPrice: 18000, currencyCode: 'IQD' },
    })
  })

  it('a currency alone is enough to save, and a quantity edit sends no currency', () => {
    show()
    openEdit('Pipe 20mm')
    fireEvent.change(screen.getByRole('combobox', { name: 'Currency: Pipe 20mm' }), {
      target: { value: 'EUR' },
    })
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
    expect(mutationFns.EditReviewPurchase).toHaveBeenLastCalledWith({
      variables: {
        purchaseId: 'p1',
        qty: undefined,
        actualUnitPrice: undefined,
        currencyCode: 'EUR',
      },
    })
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Cancel' }))
    openEdit('Pipe 20mm')
    fireEvent.change(qtyBox(), { target: { value: '15' } })
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
    expect(mutationFns.EditReviewPurchase.mock.calls.at(-1)?.[0]).toEqual({
      variables: { purchaseId: 'p1', qty: 15 },
    })
    expect(
      (
        mutationFns.EditReviewPurchase.mock.calls.at(-1)?.[0] as {
          variables: Record<string, unknown>
        }
      ).variables.currencyCode,
    ).toBeUndefined()
  })

  it('a purchase in a currency outside the short list keeps its own as a choice', () => {
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            purchases: [purchase({ currency_code: 'GBP' })],
          },
        ],
      }),
    )
    openEdit('Pipe 20mm')
    const box = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Currency: Pipe 20mm' })
    expect(box.value).toBe('GBP')
    expect(Array.from(box.options).map((o) => o.value)).toEqual([
      'GBP',
      'IQD',
      'USD',
      'EUR',
      'TRY',
      'AED',
    ])
  })

  it('shows the old currency in the "was" note when the currency was changed', () => {
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            purchases: [
              purchase({
                currency_code: 'IQD',
                actual_unit_price: '18000',
                review_original_qty: '10',
                review_original_price: '12.5',
                review_original_currency: 'USD',
              }),
            ],
          },
        ],
      }),
    )
    fireEvent.click(button('Show details for Pipe 20mm'))
    expect(screen.getByTestId('review-line-details').textContent).toContain('was 12.5 USD')
    expect(within(row('Pipe 20mm')).getByText('Changed')).toBeInTheDocument()
  })

  it('a purchase whose only change is its currency still counts as changed', () => {
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            purchases: [purchase({ currency_code: 'IQD', review_original_currency: 'USD' })],
          },
        ],
      }),
    )
    expect(within(row('Pipe 20mm')).getByText('Changed')).toBeInTheDocument()
  })

  it('sends a new quantity alone, and both when both changed', () => {
    show()
    openEdit('Pipe 20mm')
    fireEvent.change(qtyBox(), { target: { value: '8' } })
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
    expect(mutationFns.EditReviewPurchase).toHaveBeenLastCalledWith({
      variables: { purchaseId: 'p1', qty: 8, actualUnitPrice: undefined },
    })
    // the row stays open until the server answers; close it and open it again
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Cancel' }))
    openEdit('Pipe 20mm')
    fireEvent.change(qtyBox(), { target: { value: '9' } })
    fireEvent.change(priceBox(), { target: { value: '13.25' } })
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
    expect(mutationFns.EditReviewPurchase).toHaveBeenLastCalledWith({
      variables: { purchaseId: 'p1', qty: 9, actualUnitPrice: 13.25 },
    })
  })

  it('closes without asking the server when nothing was changed', () => {
    show()
    openEdit('Pipe 20mm')
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
    expect(mutationFns.EditReviewPurchase).not.toHaveBeenCalled()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('refuses a zero or an empty number in words, and sends nothing', () => {
    show()
    openEdit('Pipe 20mm')
    fireEvent.change(qtyBox(), { target: { value: '0' } })
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
    expect(addToast).toHaveBeenCalledWith({
      message: 'The quantity and the price must be above zero',
      type: 'error',
    })
    expect(mutationFns.EditReviewPurchase).not.toHaveBeenCalled()
    expect(qtyBox().getAttribute('aria-invalid')).toBe('true')
  })

  it('cancel puts the row back without sending anything', () => {
    show()
    openEdit('Pipe 20mm')
    fireEvent.change(priceBox(), { target: { value: '99' } })
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(mutationFns.EditReviewPurchase).not.toHaveBeenCalled()
    expect(row('Pipe 20mm').textContent).toContain('12.5 USD')
  })

  it("after a save it closes the boxes, says so and reads the requisition again; a refusal is shown in the server's words", () => {
    show()
    openEdit('Pipe 20mm')
    act(() => {
      complete('EditReviewPurchase')
    })
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(addToast).toHaveBeenCalledWith({ message: 'Purchase changed', type: 'success' })
    expect(onChanged).toHaveBeenCalledTimes(1)
    fail('EditReviewPurchase', { message: 'Cannot make it 11' })
    expect(addToast).toHaveBeenLastCalledWith({ message: 'Cannot make it 11', type: 'error' })
  })

  it('holds Confirm and Submit while a row is open, so an unsaved number can never be left behind', () => {
    const { unmount } = show()
    expect(button('Confirm and create purchase orders')).toBeEnabled()
    openEdit('Pipe 20mm')
    expect(button('Confirm and create purchase orders')).toBeDisabled()
    unmount()
    // the same when a PO Admin is needed and the main button is Submit
    show(
      requisition({
        review: reviewData({ needs_approval: true, approval_reason: '1 purchase was changed' }),
      }),
    )
    expect(button('Submit for re-approval')).toBeEnabled()
    openEdit('Pipe 20mm')
    expect(button('Submit for re-approval')).toBeDisabled()
  })
})

describe("the action bar follows the server's flags", () => {
  it('nothing changed and no PO Admin needed: one main button, Confirm, and it says the purchase orders will be created', () => {
    show()
    fireEvent.click(button('Confirm and create purchase orders'))
    expect(mutationFns.ConfirmReview).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1' },
    })
    expect(screen.queryByRole('button', { name: 'Submit for re-approval' })).toBeNull()
    expect(
      screen.getByText(/Nothing was changed\. Confirm and the purchase orders are created\./),
    ).toBeInTheDocument()
  })

  it('a PO Admin needed: the main button is Submit, never Confirm, with the reason', () => {
    show(
      requisition({
        review: reviewData({
          needs_approval: true,
          approval_reason: 'the organizer recorded 2 purchases himself',
        }),
      }),
    )
    expect(screen.queryByRole('button', { name: 'Confirm and create purchase orders' })).toBeNull()
    fireEvent.click(button('Submit for re-approval'))
    expect(mutationFns.SubmitReviewForApproval).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1' },
    })
    expect(mutationFns.ConfirmReview).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'A PO Admin has to approve first: the organizer recorded 2 purchases himself.',
      ),
    ).toBeInTheDocument()
  })

  it('someone who may not act sees who it is waiting for, and no button', () => {
    show(requisition({ review: reviewData({ caller_can_edit: false }) }))
    expect(
      screen.getByText('Waiting for Olivia Organizer to review what was bought.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm and create purchase orders' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send back to Items Bought' })).toBeNull()
  })

  it('after confirming it says so and reads the requisition again', () => {
    show()
    act(() => {
      complete('ConfirmReview')
    })
    expect(addToast).toHaveBeenCalledWith({
      message: 'Confirmed, the purchase orders were created',
      type: 'success',
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('a PO Admin sees Approve and the way back, and Approve calls approveReview', () => {
    show(
      requisition({
        status: 'review_approval',
        review: reviewData({
          caller_can_edit: false,
          caller_can_approve: true,
          needs_approval: true,
          approval_reason: '1 purchase was changed',
        }),
      }),
    )
    expect(screen.getByText('Next step: approve the changes')).toBeInTheDocument()
    expect(screen.getByText(/Olivia Organizer changed what was bought/)).toBeInTheDocument()
    fireEvent.click(button('Approve and create purchase orders'))
    expect(mutationFns.ApproveReview).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1' },
    })
    expect(button('Send back to the organizer')).toBeInTheDocument()
  })

  it('anyone who cannot approve only sees that a PO Admin has it', () => {
    show(
      requisition({
        status: 'review_approval',
        review: reviewData({ caller_can_edit: false, caller_can_approve: false }),
      }),
    )
    expect(screen.getAllByText('Waiting for a PO Admin').length).toBeGreaterThan(0)
    expect(screen.getByText('Waiting for a PO Admin to approve.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve and create purchase orders' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send back to the organizer' })).toBeNull()
  })

  it('an organizer who may approve (the server says so) sees Approve and Send back like any approver', () => {
    show(
      requisition({
        status: 'review_approval',
        review: reviewData({ caller_can_edit: false, caller_can_approve: true }),
      }),
    )
    expect(
      screen.getByRole('button', { name: 'Approve and create purchase orders' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send back to the organizer' })).toBeInTheDocument()
    expect(screen.queryByText('Waiting for a PO Admin to approve.')).toBeNull()
  })

  it('draws the bar in the slot at the end of the page when one is given, and inline when not', () => {
    const slot = document.createElement('div')
    slot.setAttribute('data-testid', 'slot')
    document.body.appendChild(slot)
    const { unmount } = show(requisition(), { barSlot: slot })
    expect(
      within(slot).getByRole('button', { name: 'Confirm and create purchase orders' }),
    ).toBeInTheDocument()
    unmount()
    slot.remove()
    const { container } = show()
    expect(
      within(container).getByRole('button', { name: 'Confirm and create purchase orders' }),
    ).toBeInTheDocument()
  })
})

describe('sending it back to the buyers', () => {
  const open = () => {
    show()
    fireEvent.click(button('Send back to Items Bought'))
    return screen.getByRole('dialog', { name: 'Send REQ-2026-0101 back to Items Bought' })
  }

  it('asks for a reason and will not send without one', () => {
    const d = open()
    const send = within(d).getByRole('button', { name: 'Send back' })
    expect(send).toBeDisabled()
    fireEvent.change(within(d).getByRole('textbox'), { target: { value: '   ' } })
    expect(send).toBeDisabled()
    fireEvent.change(within(d).getByRole('textbox'), {
      target: { value: 'Wrong vendor on the valve' },
    })
    expect(send).toBeEnabled()
  })

  it('sends the reason with no purchases to remove by default', () => {
    const d = open()
    fireEvent.change(within(d).getByRole('textbox'), {
      target: { value: '  Receipt is unreadable ' },
    })
    fireEvent.click(within(d).getByRole('button', { name: 'Send back' }))
    expect(mutationFns.SendBackToBuying).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1', reason: 'Receipt is unreadable', purchaseIds: [] },
    })
  })

  it('lists every purchase to tick, and sends exactly the ticked ones', () => {
    const d = open()
    const boxes = within(d).getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    fireEvent.click(boxes[1])
    fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'Wrong vendor' } })
    fireEvent.click(within(d).getByRole('button', { name: 'Send back' }))
    expect(mutationFns.SendBackToBuying).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1', reason: 'Wrong vendor', purchaseIds: ['p2'] },
    })
    // ticking and un-ticking leaves nothing
    fireEvent.click(boxes[1])
    fireEvent.click(boxes[1])
    fireEvent.click(boxes[1])
    fireEvent.click(within(d).getByRole('button', { name: 'Send back' }))
    expect(mutationFns.SendBackToBuying).toHaveBeenLastCalledWith({
      variables: { requisitionId: 'req-1', reason: 'Wrong vendor', purchaseIds: [] },
    })
  })

  it('closes after it worked, forgets the reason and the ticks, says so, and reads the requisition again', () => {
    const d = open()
    fireEvent.click(within(d).getAllByRole('checkbox')[0])
    fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'Wrong vendor' } })
    act(() => {
      complete('SendBackToBuying')
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(addToast).toHaveBeenCalledWith({ message: 'Sent back to Items Bought', type: 'success' })
    expect(onChanged).toHaveBeenCalledTimes(1)
    fireEvent.click(button('Send back to Items Bought'))
    const again = screen.getByRole('dialog')
    expect(within(again).getByRole<HTMLTextAreaElement>('textbox').value).toBe('')
    for (const b of within(again).getAllByRole('checkbox'))
      expect((b as HTMLInputElement).checked).toBe(false)
  })

  it('keeps the dialog open, with what was typed, when the server refuses', () => {
    const d = open()
    fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'Wrong vendor' } })
    act(() => {
      fail('SendBackToBuying', {
        message: 'The requisition is in review_approval',
      })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole<HTMLTextAreaElement>('textbox').value).toBe(
      'Wrong vendor',
    )
    expect(addToast).toHaveBeenCalledWith({
      message: 'The requisition is in review_approval',
      type: 'error',
    })
  })
})

describe('the PO Admin sending it back to the organizer', () => {
  const approverReq = () =>
    requisition({
      status: 'review_approval',
      review: reviewData({
        caller_can_edit: false,
        caller_can_approve: true,
        needs_approval: true,
      }),
    })
  const open = () => {
    show(approverReq())
    fireEvent.click(button('Send back to the organizer'))
    return screen.getByRole('dialog', { name: 'Send the changes back to Olivia Organizer' })
  }

  it('needs a reason, then sends it with the requisition', () => {
    const d = open()
    const send = within(d).getByRole('button', { name: 'Send back' })
    expect(send).toBeDisabled()
    fireEvent.change(within(d).getByRole('textbox'), {
      target: { value: ' Ask the vendor again ' },
    })
    fireEvent.click(send)
    expect(mutationFns.RejectReview).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1', reason: 'Ask the vendor again' },
    })
  })

  it('closes and forgets the reason after it worked', () => {
    const d = open()
    fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'No' } })
    act(() => {
      complete('RejectReview')
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(addToast).toHaveBeenCalledWith({
      message: 'Sent back to the organizer',
      type: 'success',
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})

describe('flagging lines while sending it back', () => {
  const approverReq = (over: Partial<Req> = {}) =>
    requisition({
      status: 'review_approval',
      review: reviewData({
        caller_can_edit: false,
        caller_can_approve: true,
        needs_approval: true,
      }),
      ...over,
    })
  const boxes = () => screen.queryAllByTitle('Flag this line for rejection')
  const openDialog = () => {
    fireEvent.click(button('Send back to the organizer'))
    return screen.getByRole('dialog', { name: 'Send the changes back to Olivia Organizer' })
  }
  const sentVariables = () =>
    (mutationFns.RejectReview.mock.calls[0] as [{ variables: Record<string, unknown> }])[0]
      .variables

  it('offers a tick box on every line to the approver, and none to anyone else', () => {
    show(approverReq())
    expect(boxes()).toHaveLength(2)
    cleanup()
    show(approverReq({ review: reviewData({ caller_can_edit: false, caller_can_approve: false }) }))
    expect(boxes()).toHaveLength(0)
    cleanup()
    show(requisition())
    expect(boxes()).toHaveLength(0)
  })

  it('ticking a line opens it with a box for what is wrong', () => {
    show(approverReq())
    expect(screen.queryByPlaceholderText('Say what the organizer has to fix')).toBeNull()
    fireEvent.click(boxes()[0])
    expect(boxes()[0]).toBeChecked()
    expect(screen.getByTestId('review-flag-block')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Say what the organizer has to fix')).toBeInTheDocument()
    fireEvent.click(boxes()[0])
    expect(boxes()[0]).not.toBeChecked()
    expect(screen.queryByPlaceholderText('Say what the organizer has to fix')).toBeNull()
  })

  it('sends the flagged lines with their reasons, and the reasons are the reason when none is typed', () => {
    show(approverReq())
    fireEvent.click(boxes()[0])
    fireEvent.click(boxes()[1])
    const [first, second] = screen.getAllByPlaceholderText('Say what the organizer has to fix')
    fireEvent.change(first, { target: { value: ' Price is too high ' } })
    fireEvent.change(second, { target: { value: 'Wrong vendor' } })
    const d = openDialog()
    expect(within(d).getByTestId('review-reject-flags').textContent).toContain('Flagged lines (2)')
    const send = within(d).getByRole('button', { name: 'Send back' })
    expect(send).toBeEnabled()
    fireEvent.click(send)
    expect(mutationFns.RejectReview).toHaveBeenCalledTimes(1)
    const vars = sentVariables()
    expect(vars.requisitionId).toBe('req-1')
    expect(vars.lineFlags).toEqual([
      { lineId: 'l1', reason: 'Price is too high' },
      { lineId: 'l2', reason: 'Wrong vendor' },
    ])
    expect(vars.reason).toBe('• Pipe 20mm: Price is too high\n• Valve: Wrong vendor')
  })

  it('a typed reason wins over the composed one, and still sends the flags', () => {
    show(approverReq())
    fireEvent.click(boxes()[0])
    fireEvent.change(screen.getByPlaceholderText('Say what the organizer has to fix'), {
      target: { value: 'Too dear' },
    })
    const d = openDialog()
    fireEvent.change(within(d).getAllByRole('textbox')[0], { target: { value: 'See my notes' } })
    fireEvent.click(within(d).getByRole('button', { name: 'Send back' }))
    const vars = sentVariables()
    expect(vars.reason).toBe('See my notes')
    expect(vars.lineFlags).toEqual([{ lineId: 'l1', reason: 'Too dear' }])
  })

  it('a flagged line with no reason holds the button back and says which line needs one', () => {
    show(approverReq())
    fireEvent.click(boxes()[0])
    const d = openDialog()
    expect(within(d).getByRole('button', { name: 'Send back' })).toBeDisabled()
    expect(within(d).getByTestId('review-reject-flags').textContent).toContain('Pipe 20mm')
    expect(within(d).getByTestId('review-reject-flags').textContent).toContain('needs a reason')
    // a reason typed on top does not excuse the empty line
    fireEvent.change(within(d).getAllByRole('textbox')[0], { target: { value: 'General' } })
    expect(within(d).getByRole('button', { name: 'Send back' })).toBeDisabled()
  })

  it('with no line flagged it still works on a reason alone, and sends no flags', () => {
    show(approverReq())
    const d = openDialog()
    expect(within(d).queryByTestId('review-reject-flags')).toBeNull()
    fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'Everything is wrong' } })
    fireEvent.click(within(d).getByRole('button', { name: 'Send back' }))
    const vars = sentVariables()
    expect(vars.lineFlags).toBeUndefined()
    expect(vars.reason).toBe('Everything is wrong')
  })

  it('forgets the ticks once it was sent back', () => {
    show(approverReq())
    fireEvent.click(boxes()[0])
    openDialog()
    act(() => {
      complete('RejectReview')
    })
    expect(boxes()[0]).not.toBeChecked()
    expect(screen.queryByTestId('review-flag-block')).toBeNull()
  })

  describe('what the organizer sees afterwards', () => {
    const flagged = (over: Record<string, unknown> = {}) =>
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Copper pipe',
            product_name: 'Pipe 20mm',
            purchases: [purchase()],
            flag_reason: 'Price is too high',
            flagged_at: '2026-11-25T10:00:00Z',
            flagged_by_name: 'Paula Poadmin',
            flagged_from_status: 'review_approval',
            flag_addressed_at: null,
            flag_resolved_at: null,
            ...over,
          },
          {
            id: 'l2',
            line_number: 2,
            description: 'Valve',
            product_name: null,
            purchases: [purchase({ id: 'p2' })],
          },
        ],
      })

    it('a flagged line says so in its status and gives the reason and who flagged it', () => {
      show(flagged())
      expect(within(row('Pipe 20mm')).getByText('Flagged')).toBeInTheDocument()
      expect(within(row('Valve')).queryByText('Flagged')).toBeNull()
      fireEvent.click(button('Show details for Pipe 20mm'))
      const block = screen.getByTestId('review-flag-block')
      expect(block.textContent).toContain('Flagged by Paula Poadmin')
      expect(block.textContent).toContain('Price is too high')
    })

    it('a flag he has answered (resubmitted) reads "Flag answered", not "Flagged"', () => {
      show(flagged({ flag_addressed_at: '2026-11-25T12:00:00Z' }))
      expect(within(row('Pipe 20mm')).getByText('Flag answered')).toBeInTheDocument()
      expect(within(row('Pipe 20mm')).queryByText('Flagged')).toBeNull()
    })

    it('a settled flag, or one from another stage, is not shown here', () => {
      show(flagged({ flag_resolved_at: '2026-11-25T13:00:00Z' }))
      expect(within(row('Pipe 20mm')).queryByText('Flagged')).toBeNull()
      cleanup()
      show(flagged({ flagged_from_status: 'pending_approval' }))
      expect(within(row('Pipe 20mm')).queryByText('Flagged')).toBeNull()
    })

    it('the organizer cannot flag anything himself', () => {
      show(flagged())
      expect(boxes()).toHaveLength(0)
    })
  })

  describe('on a phone', () => {
    const setWidth = (w: number) => {
      Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
    }
    afterEach(() => {
      setWidth(1024)
    })

    it('the sheet has the flag box and its reason', () => {
      setWidth(390)
      show(approverReq())
      fireEvent.click(screen.getAllByTestId('review-line-card')[0])
      const box = screen.getByRole('checkbox', { name: 'Flag this line for the organizer' })
      expect(box).not.toBeChecked()
      fireEvent.click(box)
      expect(screen.getByPlaceholderText('Say what the organizer has to fix')).toBeInTheDocument()
      expect(
        screen.getByRole('checkbox', { name: 'Flag this line for the organizer' }),
      ).toBeChecked()
    })

    it('someone who cannot approve gets no flag box in the sheet', () => {
      setWidth(390)
      show(requisition())
      fireEvent.click(screen.getAllByTestId('review-line-card')[0])
      expect(
        screen.queryByRole('checkbox', { name: 'Flag this line for the organizer' }),
      ).toBeNull()
    })
  })
})

describe('the store keeper signs off items taken from stock before the administrator approves', () => {
  const inApproval = (review: Partial<ReviewData>) =>
    requisition({
      status: 'review_approval',
      review: reviewData({
        caller_can_edit: false,
        needs_approval: true,
        stocked_count: 1,
        ...review,
      }),
    })
  const pending: NonNullable<ReviewData['stock_review']> = {
    status: 'pending',
    by_name: null,
    at: null,
    reason: null,
  }
  const approveBtn = () =>
    screen.queryByRole('button', { name: 'Approve and create purchase orders' })

  describe('what the administrator sees', () => {
    it('cannot approve while the store keeper has not signed, and is told why', () => {
      show(inApproval({ caller_can_approve: true, stock_review: pending }))
      expect(approveBtn()).toBeDisabled()
      expect(screen.getByTestId('review-bar-status').textContent).toBe(
        'Waiting for the store keeper to approve the items taken from stock.',
      )
      expect(screen.getByTestId('review-stock-signoff').textContent).toContain(
        'Waiting for the store keeper to approve the items taken from stock (1).',
      )
      // sending it back stays possible: the administrator has the last word
      expect(screen.getByRole('button', { name: 'Send back to the organizer' })).toBeEnabled()
    })

    it('can approve once the store keeper has signed, and sees who', () => {
      show(
        inApproval({
          caller_can_approve: true,
          stock_review: {
            status: 'approved',
            by_name: 'Karim Keeper',
            at: '2026-11-25T10:00:00Z',
            reason: null,
          },
        }),
      )
      expect(approveBtn()).toBeEnabled()
      expect(screen.getByTestId('review-stock-signoff').textContent).toContain(
        'Stock approved by Karim Keeper.',
      )
      expect(screen.queryByTestId('review-bar-status')).toBeNull()
    })

    it("sees the store keeper's reason when it was rejected, cannot approve, and can still send it back", () => {
      show(
        inApproval({
          caller_can_approve: true,
          stock_review: {
            status: 'rejected',
            by_name: 'Karim Keeper',
            at: null,
            reason: 'Shelf A has only 2 left',
          },
        }),
      )
      expect(approveBtn()).toBeDisabled()
      const box = screen.getByTestId('review-stock-signoff')
      expect(box.textContent).toContain('Stock rejected by Karim Keeper:')
      expect(box.textContent).toContain('Shelf A has only 2 left')
      expect(screen.getByTestId('review-bar-status').textContent).toContain(
        'rejected the items taken from stock',
      )
      expect(screen.getByRole('button', { name: 'Send back to the organizer' })).toBeEnabled()
    })

    it('has no store keeper step at all when nothing was taken from stock', () => {
      show(inApproval({ caller_can_approve: true, stock_review: null }))
      expect(approveBtn()).toBeEnabled()
      expect(screen.queryByTestId('review-stock-signoff')).toBeNull()
      expect(screen.queryByTestId('review-bar-status')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Approve stock' })).toBeNull()
    })

    it('an administrator who is also the store keeper gets both sets of buttons', () => {
      show(
        inApproval({
          caller_can_approve: true,
          caller_can_decide_stock: true,
          stock_review: pending,
        }),
      )
      expect(screen.getByRole('button', { name: 'Approve stock' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Reject stock' })).toBeEnabled()
      expect(approveBtn()).toBeDisabled()
    })
  })

  describe('what the store keeper sees', () => {
    const keeper = (stock = pending) =>
      inApproval({ caller_can_approve: false, caller_can_decide_stock: true, stock_review: stock })

    it('gets Approve stock and Reject stock, and no way to approve the review or send it back', () => {
      show(keeper())
      expect(screen.getByText('Check the items taken from stock')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Approve stock' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Reject stock' })).toBeEnabled()
      expect(approveBtn()).toBeNull()
      expect(screen.queryByRole('button', { name: 'Send back to the organizer' })).toBeNull()
      // no ticking lines either: that is for the one who can send it back
      expect(screen.queryAllByTitle('Flag this line for rejection')).toHaveLength(0)
    })

    it('Approve stock sends the requisition', () => {
      show(keeper())
      fireEvent.click(screen.getByRole('button', { name: 'Approve stock' }))
      expect(mutationFns.ApproveReviewStock).toHaveBeenCalledWith({
        variables: { requisitionId: 'req-1' },
      })
      act(() => {
        complete('ApproveReviewStock')
      })
      expect(addToast).toHaveBeenCalledWith({ message: 'Stock approved', type: 'success' })
      expect(onChanged).toHaveBeenCalledTimes(1)
    })

    it('Reject stock needs a reason, sends it trimmed, and closes when it worked', () => {
      show(keeper())
      fireEvent.click(screen.getByRole('button', { name: 'Reject stock' }))
      const d = screen.getByRole('dialog', { name: 'Reject the items taken from stock' })
      const send = within(d).getByRole('button', { name: 'Reject stock' })
      expect(send).toBeDisabled()
      fireEvent.change(within(d).getByRole('textbox'), {
        target: { value: '  Shelf A has only 2  ' },
      })
      fireEvent.click(send)
      expect(mutationFns.RejectReviewStock).toHaveBeenCalledWith({
        variables: { requisitionId: 'req-1', reason: 'Shelf A has only 2' },
      })
      act(() => {
        complete('RejectReviewStock')
      })
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(addToast).toHaveBeenCalledWith({
        message: 'Stock rejected: the administrator has been told',
        type: 'success',
      })
    })

    it('after approving it says the administrator is next, and Approve stock is done', () => {
      show(keeper({ status: 'approved', by_name: 'Karim Keeper', at: null, reason: null }))
      expect(screen.getByRole('button', { name: 'Approve stock' })).toBeDisabled()
      expect(screen.getByTestId('review-bar-status').textContent).toBe(
        'You approved the items taken from stock. Waiting for a PO Admin.',
      )
    })

    it('can still reject after approving, until the administrator acts', () => {
      show(keeper({ status: 'approved', by_name: 'Karim Keeper', at: null, reason: null }))
      expect(screen.getByRole('button', { name: 'Reject stock' })).toBeEnabled()
    })
  })

  it('anyone else only sees that a PO Admin has it, with no store keeper buttons', () => {
    show(
      inApproval({
        caller_can_approve: false,
        caller_can_decide_stock: false,
        stock_review: pending,
      }),
    )
    expect(screen.getByText('Waiting for a PO Admin to approve.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve stock' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject stock' })).toBeNull()
  })

  it('the sign-off belongs to the approval: not drawn while the organizer is still reviewing', () => {
    show(
      requisition({ review: reviewData({ stock_review: pending, caller_can_decide_stock: true }) }),
    )
    expect(screen.queryByTestId('review-stock-signoff')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve stock' })).toBeNull()
  })
})

describe('receipts are view-only here', () => {
  it('has no View button in the details on a desktop (the Receipts & photos window holds every receipt)', () => {
    show()
    fireEvent.click(button('Show details for Valve'))
    expect(
      within(screen.getByTestId('review-line-details')).queryByRole('button', { name: 'View' }),
    ).toBeNull()
  })

  it('offers no way to add a receipt, and none to view one that does not exist', () => {
    show(
      requisition({
        lines: [
          {
            id: 'l1',
            line_number: 1,
            description: 'Pipe',
            product_name: 'Pipe 20mm',
            purchases: [purchase({ receipt_file_id: null })],
          },
        ],
      }),
    )
    fireEvent.click(button('Show details for Pipe 20mm'))
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
    expect(screen.queryByText(/Add receipt/i)).toBeNull()
  })
})

describe('in Arabic', () => {
  it('reads in Arabic with no raw key left on the screen', async () => {
    await i18n.changeLanguage('ar')
    show(
      requisition({
        review: reviewData({
          needs_approval: true,
          approval_reason: 'x',
          last_rejection: { reason: 'r', by_name: 'p', at: null },
        }),
      }),
    )
    expect(screen.getByText('راجع ما تم شراؤه')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/req\.review\./)
    expect(document.body.textContent).not.toMatch(/\{\{/)
  })
})

describe('every text the panel asks for exists in both languages', () => {
  // The panel, and the dialog it opens to add an item (its texts are in the same group).
  const src = [
    'OrganizerReviewPanel.tsx',
    'AddReviewItemModal.tsx',
    'TakeFromStockModal.tsx',
    // the Lines table's own column header for the review
    '../../pages/procurement/requisitions/RequisitionDetail.tsx',
  ]
    .map((f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'))
    .join('\n')
  // Every quoted `req.review.<key>`: a `t('...')` call, or a key kept in a map (the status chips, the summary pills).
  const keys = [...src.matchAll(/'req\.review\.([A-Za-z0-9_]+)'/g)].map((m) => m[1])
  const load = (f: string) =>
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../i18n/locales', f), 'utf8')) as {
      req: { review: Record<string, string> }
    }

  it('finds the keys it uses (so this test cannot pass on an empty list)', () => {
    expect(new Set(keys).size).toBeGreaterThan(40)
  })

  it('resolves each in English and in Arabic, and every placeholder in one is in the other', () => {
    const en = load('en.json').req.review
    const ar = load('ar.json').req.review
    for (const k of new Set(keys)) {
      expect(en[k], `en ${k}`).toBeTruthy()
      expect(ar[k], `ar ${k}`).toBeTruthy()
      const holes = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
      expect(holes(ar[k]), `placeholders of ${k}`).toEqual(holes(en[k]))
    }
    // and nothing is defined that the panel does not use
    expect(Object.keys(en).filter((k) => !keys.includes(k))).toEqual([])
  })
})

// The price after the vendor's discount (migration 336, playbook #124): in the Change form a purchase can carry the unit price
// after a discount; when it is filled it is the price that counts, so the row, the line's Total and the "was" all read it, and
// the quoted price is shown beside it as information only.
describe('price after discount', () => {
  const openEdit = (text: string) => {
    fireEvent.click(within(row(text)).getByRole('button', { name: 'Change' }))
  }
  const priceBox = () =>
    screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Unit price: Pipe 20mm' })
  const discountBox = () =>
    screen.getByRole<HTMLInputElement>('spinbutton', {
      name: 'Price after discount: Pipe 20mm',
    })
  const save = () => {
    fireEvent.click(within(row('Pipe 20mm')).getByRole('button', { name: 'Save' }))
  }
  const withDiscount = (discounted: string | null) =>
    requisition({
      lines: [
        {
          id: 'l1',
          line_number: 1,
          description: 'Copper pipe',
          product_name: 'Pipe 20mm',
          purchases: [purchase({ discounted_unit_price: discounted })],
        },
      ],
    })
  const lastVariables = () =>
    (
      mutationFns.EditReviewPurchase.mock.calls.at(-1)?.[0] as {
        variables: Record<string, unknown>
      }
    ).variables

  it('the Change form has the box, empty for a purchase with no discount and filled for one that has it', () => {
    const { unmount } = show(withDiscount(null))
    openEdit('Pipe 20mm')
    expect(discountBox().value).toBe('')
    expect(discountBox()).toHaveAttribute('placeholder', 'After discount')
    unmount()
    show(withDiscount('11'))
    openEdit('Pipe 20mm')
    expect(discountBox().value).toBe('11')
  })

  it('a typed price after discount is sent alone, with no other field', () => {
    show(withDiscount(null))
    openEdit('Pipe 20mm')
    fireEvent.change(discountBox(), { target: { value: '11.5' } })
    save()
    expect(mutationFns.EditReviewPurchase).toHaveBeenCalledTimes(1)
    expect(lastVariables()).toEqual({ purchaseId: 'p1', discountedUnitPrice: 11.5 })
  })

  it('emptying the box on a discounted purchase sends null, which takes the discount off', () => {
    show(withDiscount('11'))
    openEdit('Pipe 20mm')
    fireEvent.change(discountBox(), { target: { value: '' } })
    save()
    expect(lastVariables()).toEqual({ purchaseId: 'p1', discountedUnitPrice: null })
  })

  it('leaving the discount alone sends no discount key, and nothing at all when nothing changed', () => {
    show(withDiscount('11'))
    openEdit('Pipe 20mm')
    save()
    expect(mutationFns.EditReviewPurchase).not.toHaveBeenCalled()
    openEdit('Pipe 20mm')
    fireEvent.change(priceBox(), { target: { value: '13' } })
    save()
    expect('discountedUnitPrice' in lastVariables()).toBe(false)
    expect(lastVariables().actualUnitPrice).toBe(13)
  })

  it('a price after discount above the price is refused with a sentence, and nothing is sent', () => {
    show(withDiscount(null))
    openEdit('Pipe 20mm')
    fireEvent.change(discountBox(), { target: { value: '20' } })
    expect(discountBox()).toHaveAttribute('aria-invalid', 'true')
    save()
    expect(addToast).toHaveBeenCalledWith({
      message: 'The price after discount cannot be higher than the price the vendor quoted',
      type: 'error',
    })
    expect(mutationFns.EditReviewPurchase).not.toHaveBeenCalled()
  })

  it('lowering the price below an existing discount is refused the same way (the form still holds the discount)', () => {
    show(withDiscount('11'))
    openEdit('Pipe 20mm')
    fireEvent.change(priceBox(), { target: { value: '10' } })
    save()
    expect(addToast).toHaveBeenCalledWith({
      message: 'The price after discount cannot be higher than the price the vendor quoted',
      type: 'error',
    })
    expect(mutationFns.EditReviewPurchase).not.toHaveBeenCalled()
  })

  it('a price after discount of zero is refused, and nothing is sent', () => {
    show(withDiscount(null))
    openEdit('Pipe 20mm')
    fireEvent.change(discountBox(), { target: { value: '0' } })
    save()
    expect(addToast).toHaveBeenCalledWith({
      message:
        'The price after discount must be greater than 0 — clear the box if there is no discount',
      type: 'error',
    })
    expect(mutationFns.EditReviewPurchase).not.toHaveBeenCalled()
  })

  it('a discounted purchase reads at the price that counts, with the quoted price beside it', () => {
    show(withDiscount('11'))
    const r = row('Pipe 20mm')
    expect(within(r).getByText(/10 @ 11 USD/)).toBeInTheDocument()
    expect(within(r).getByTestId('quoted-note')).toHaveTextContent('(quoted 12.5)')
  })

  it('a purchase with no discount shows no quoted note', () => {
    show(withDiscount(null))
    const r = row('Pipe 20mm')
    expect(within(r).getByText(/10 @ 12\.5 USD/)).toBeInTheDocument()
    expect(within(r).queryByTestId('quoted-note')).toBeNull()
  })

  it('the line total sums the price after discount per currency', async () => {
    const { reviewLineTotals } = await import('../OrganizerReviewPanel')
    const total = reviewLineTotals({
      id: 'l',
      purchases: [
        purchase({ qty: '5', actual_unit_price: '42.5', discounted_unit_price: '40' }),
        purchase({ id: 'p9', qty: '2', actual_unit_price: '10', discounted_unit_price: null }),
      ],
    } as never)
    expect(total).toEqual([{ currency: 'USD', amount: 5 * 40 + 2 * 10 }])
  })
})
