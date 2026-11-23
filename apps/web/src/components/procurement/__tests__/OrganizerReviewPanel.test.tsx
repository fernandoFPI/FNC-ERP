// The organizer review panel (migration 329, playbook #115): what the organizer sees between Items Bought and Sourcing, what he
// can change, which button the server's flags put in the action bar, and the two dialogs. The rules (who may, whether a PO Admin is
// needed) come from the server in `review`; these tests pin that the panel follows those flags and keeps no rule of its own.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { OrganizerReviewPanel } from '../OrganizerReviewPanel'
import type { OrganizerReviewPanelProps, ReviewData } from '../OrganizerReviewPanel'

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
function show(req: Req = requisition(), extra: Partial<OrganizerReviewPanelProps> = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <OrganizerReviewPanel requisition={req} onChanged={onChanged} {...extra} />
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
    const { container } = show(requisition({ review: null }))
    expect(container.textContent).toBe('')
  })

  it('names the step, says nothing becomes a purchase order until he confirms, and lists each purchase with its total', () => {
    show()
    expect(screen.getByText('Review what was bought')).toBeInTheDocument()
    expect(
      screen.getByText(/Nothing becomes a purchase order until you confirm/),
    ).toBeInTheDocument()
    const first = row('Pipe 20mm')
    expect(first.textContent).toContain('Al Noor Hardware')
    expect(first.textContent).toContain('12.5 USD')
    expect(first.textContent).toContain('125 USD') // 10 x 12.5
    expect(first.textContent).toContain('Bassam Buyer')
    // a line with no catalogue product shows its description
    expect(row('Valve').textContent).toContain('Dar Steel')
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
    expect(r.textContent).toContain('was 10')
    expect(r.textContent).toContain('was 12.5')
    expect(r.textContent).toContain('104 USD')
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
    const r = row('Pipe 20mm')
    expect(within(r).getByText('No receipt')).toBeInTheDocument()
    expect(within(r).getByText('Over tolerance')).toBeInTheDocument()
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
    expect(row('Pipe 20mm').textContent).toContain('was 12.5 USD')
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
    expect(button('Submit for PO Admin approval')).toBeEnabled()
    openEdit('Pipe 20mm')
    expect(button('Submit for PO Admin approval')).toBeDisabled()
  })
})

describe("the action bar follows the server's flags", () => {
  it('nothing changed and no PO Admin needed: one main button, Confirm, and it says the purchase orders will be created', () => {
    show()
    fireEvent.click(button('Confirm and create purchase orders'))
    expect(mutationFns.ConfirmReview).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1' },
    })
    expect(screen.queryByRole('button', { name: 'Submit for PO Admin approval' })).toBeNull()
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
    fireEvent.click(button('Submit for PO Admin approval'))
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

  it('anyone else, including the organizer, only sees that a PO Admin has it', () => {
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

describe('receipts are view-only here', () => {
  it('opens the receipts of that purchase in a read-only window', () => {
    show()
    fireEvent.click(within(row('Dar Steel')).getByRole('button', { name: 'View' }))
    expect(screen.getByTestId('attachments').textContent).toBe('po_line_purchase:p2:readonly')
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
  const src = ['OrganizerReviewPanel.tsx', 'AddReviewItemModal.tsx', 'TakeFromStockModal.tsx']
    .map((f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'))
    .join('\n')
  const keys = [...src.matchAll(/t\('req\.review\.([A-Za-z0-9_]+)'/g)].map((m) => m[1])
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
