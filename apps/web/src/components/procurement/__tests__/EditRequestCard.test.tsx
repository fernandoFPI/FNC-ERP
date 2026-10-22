// The Edit Request History card on a PO. It used to show "line qty ordered 1.0000 → 540" and
// "− 1 line removed" with no way to tell which line, the requester's email only, and no hint of
// what approving or rejecting would do. Now it names the lines, the people and the time, says why
// the request is waiting, and what each choice leaves behind.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { EditRequestCard, type EditRequestView } from '../EditRequestCard'

const onPo = [
  { id: 'cable', description: 'Cable 3x2.5' },
  { id: 'box', description: 'Junction box' },
]

function request(over: Partial<EditRequestView> = {}): EditRequestView {
  return {
    id: 'er-1',
    status: 'pending',
    changes: JSON.stringify({ lines: { removed: ['box'] } }),
    request_notes: null,
    requested_by: 'u-yazin',
    requested_by_name: 'Yazin Nasser',
    requested_by_email: 'yazin@npbsco.com',
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_by_email: null,
    review_notes: null,
    reviewed_at: null,
    created_at: '2026-10-22T12:00:00Z',
    auto_applied: false,
    ...over,
  }
}

function renderCard(
  er: EditRequestView,
  extra: Partial<Parameters<typeof EditRequestCard>[0]> = {},
) {
  const onApprove = vi.fn()
  const onReject = vi.fn()
  render(
    <ThemeProvider>
      <EditRequestCard
        request={er}
        currentLines={onPo}
        onApprove={onApprove}
        onReject={onReject}
        {...extra}
      />
    </ThemeProvider>,
  )
  return { onApprove, onReject }
}

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('EditRequestCard: what changed', () => {
  it('names the removed line instead of just counting it', () => {
    renderCard(request())
    expect(screen.getByText('Junction box')).toBeInTheDocument()
    expect(screen.getByText(/−/)).toBeInTheDocument()
    expect(screen.getByText('1 change')).toBeInTheDocument()
  })

  it('shows what a removed line was: quantity and price, when they were recorded', () => {
    renderCard(
      request({
        status: 'approved',
        changes: JSON.stringify({
          lines: {
            removed: [
              {
                id: 'x',
                description: 'Valve 2"',
                qty: 4,
                unit_price: 12500,
                uom: 'ea',
                currency_code: 'IQD',
              },
            ],
          },
        }),
      }),
    )
    expect(screen.getByText('Valve 2"')).toBeInTheDocument()
    expect(screen.getByText('4 ea · 12,500 IQD each')).toBeInTheDocument()
  })

  it('says so when a line is gone and its name was never recorded', () => {
    renderCard(
      request({ status: 'approved', changes: JSON.stringify({ lines: { removed: ['gone'] } }) }),
    )
    expect(screen.getByText(/A line that is no longer on this PO/)).toBeInTheDocument()
    expect(screen.getByText('(name was not recorded)')).toBeInTheDocument()
  })

  it('shows an edit under the line it is about, with readable fields and numbers', () => {
    renderCard(
      request({
        status: 'approved',
        changes: JSON.stringify({
          lines: {
            edited: [
              { id: 'cable', field: 'qty_ordered', from: '1.0000', to: 540 },
              { id: 'cable', field: 'unit_price', from: '4500.0000', to: 4800 },
            ],
          },
        }),
      }),
    )
    expect(screen.getByText('Cable 3x2.5')).toBeInTheDocument()
    expect(screen.getByText('Quantity')).toBeInTheDocument()
    expect(screen.getByText('Unit price')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument() // 1.0000 -> 1
    expect(screen.getByText('540')).toBeInTheDocument()
    expect(screen.getByText('4,500')).toBeInTheDocument()
    expect(screen.queryByText(/line qty ordered/)).toBeNull()
  })

  it('shows header changes with a readable label', () => {
    renderCard(
      request({
        changes: JSON.stringify({ header: { notes: { from: '', to: 'deliver to gate 2' } } }),
      }),
    )
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('deliver to gate 2')).toBeInTheDocument()
  })

  it('shows added lines with their quantity and price', () => {
    renderCard(
      request({
        changes: JSON.stringify({
          lines: { added: [{ description: 'Cable tie', qty: 100, unit_price: 25, uom: 'ea' }] },
        }),
      }),
    )
    expect(screen.getByText('Cable tie')).toBeInTheDocument()
    expect(screen.getByText('100 ea · 25 each')).toBeInTheDocument()
  })

  it('folds a long request behind "Show more" so Approve stays on screen, and unfolds it', () => {
    const added = Array.from({ length: 22 }, (_, i) => ({
      description: `Item ${i + 1}`,
      qty: 1,
      unit_price: 1,
    }))
    renderCard(request({ status: 'approved', changes: JSON.stringify({ lines: { added } }) }))
    expect(screen.getByText('22 changes')).toBeInTheDocument()
    expect(screen.getByText('Item 6')).toBeInTheDocument()
    expect(screen.queryByText('Item 7')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show 16 more' }))
    expect(screen.getByText('Item 22')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.queryByText('Item 22')).toBeNull()
  })

  it('does not break on a payload it cannot read', () => {
    renderCard(request({ changes: '{not json' }))
    expect(screen.getByText('No change detail was recorded.')).toBeInTheDocument()
  })
})

describe('EditRequestCard: who, when and why', () => {
  it("shows the requester's name and the time, not just an email", () => {
    renderCard(request())
    expect(screen.getByText('Yazin Nasser')).toBeInTheDocument()
    expect(screen.queryByText('yazin@npbsco.com')).toBeNull()
    expect(screen.getByText(/Oct 22, 2026/)).toBeInTheDocument()
  })

  it('falls back to the email when there is no name', () => {
    renderCard(request({ requested_by_name: null }))
    expect(screen.getByText('yazin@npbsco.com')).toBeInTheDocument()
  })

  it('shows the reason the requester gave', () => {
    renderCard(request({ request_notes: 'Supplier cancelled the box' }))
    expect(screen.getByText(/Supplier cancelled the box/)).toBeInTheDocument()
  })

  it('explains why a pending request is waiting, and that it blocks another one', () => {
    renderCard(request())
    expect(screen.getByText(/already approved need an admin's review/)).toBeInTheDocument()
    expect(screen.getByText(/No other edit request can be submitted/)).toBeInTheDocument()
  })

  it('says an auto-applied request needed no review instead of showing the raw note', () => {
    renderCard(
      request({
        status: 'approved',
        auto_applied: true,
        reviewed_by: 'u-yazin',
        reviewed_by_name: 'Yazin Nasser',
        review_notes: 'Auto-applied — PO not yet approved',
        reviewed_at: '2026-10-22T12:00:00Z',
      }),
    )
    expect(
      screen.getByText(/had not been approved yet, so no review was needed/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Auto-applied/)).toBeNull()
    expect(screen.queryByText('Reviewed by the person who raised it')).toBeNull()
  })

  it('shows who approved it and when', () => {
    renderCard(
      request({
        status: 'approved',
        reviewed_by: 'u-nadia',
        reviewed_by_name: 'Nadia Saleh',
        reviewed_at: '2026-10-23T09:30:00Z',
        review_notes: 'Fine by me',
      }),
    )
    expect(screen.getByText(/Approved by Nadia Saleh · Oct 23, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Fine by me/)).toBeInTheDocument()
    expect(screen.queryByText('Reviewed by the person who raised it')).toBeNull()
  })

  it('shows who rejected it, when and why', () => {
    renderCard(
      request({
        status: 'rejected',
        reviewed_by: 'u-nadia',
        reviewed_by_name: 'Nadia Saleh',
        reviewed_at: '2026-10-23T09:30:00Z',
        review_notes: 'Keep the box',
      }),
    )
    expect(screen.getByText(/Rejected by Nadia Saleh · Oct 23, 2026/)).toBeInTheDocument()
    expect(screen.getByText('Reason: Keep the box')).toBeInTheDocument()
  })

  it('flags a request reviewed by the person who raised it', () => {
    renderCard(
      request({
        status: 'approved',
        reviewed_by: 'u-yazin',
        reviewed_by_name: 'Yazin Nasser',
        reviewed_at: '2026-10-23T09:30:00Z',
      }),
    )
    expect(screen.getByText('Reviewed by the person who raised it')).toBeInTheDocument()
  })
})

describe('EditRequestCard: approving and rejecting', () => {
  it('says what approving and rejecting do, only while it is pending', () => {
    renderCard(request())
    expect(screen.getByText('If approved')).toBeInTheDocument()
    expect(screen.getByText(/totals are recalculated/)).toBeInTheDocument()
    expect(
      screen.getByText(/Removed lines are deleted, and any stock reserved for them is released/),
    ).toBeInTheDocument()
    expect(screen.getByText('If rejected')).toBeInTheDocument()
    expect(screen.getByText(/stays exactly as it is/)).toBeInTheDocument()
  })

  it('does not mention removed lines when none are removed', () => {
    renderCard(request({ changes: JSON.stringify({ header: { notes: { from: '', to: 'x' } } }) }))
    expect(screen.queryByText(/Removed lines are deleted/)).toBeNull()
  })

  it('has no controls and no "if" rows once reviewed', () => {
    renderCard(request({ status: 'approved', reviewed_by: 'u-n', reviewed_by_name: 'N' }))
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
    expect(screen.queryByText('If approved')).toBeNull()
  })

  it('approves with no note when the box is empty, and passes a typed note along', () => {
    const { onApprove } = renderCard(request())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenLastCalledWith('er-1', undefined)
    fireEvent.change(screen.getByPlaceholderText('Rejection reason (required)'), {
      target: { value: ' ok ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenLastCalledWith('er-1', 'ok')
  })

  it('will not reject without a reason, then rejects with it', () => {
    const { onReject } = renderCard(request())
    const reject = screen.getByRole('button', { name: 'Reject' })
    expect(reject).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Rejection reason (required)'), {
      target: { value: '   ' },
    })
    expect(reject).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Rejection reason (required)'), {
      target: { value: 'Keep the box' },
    })
    expect(reject).toBeEnabled()
    fireEvent.click(reject)
    expect(onReject).toHaveBeenCalledWith('er-1', 'Keep the box')
  })
})

describe('EditRequestCard: Arabic', () => {
  it('shows the details in Arabic without any raw translation keys', async () => {
    await i18n.changeLanguage('ar')
    renderCard(request({ request_notes: 'سبب' }))
    expect(screen.getByText('عند الموافقة')).toBeInTheDocument()
    expect(screen.getByText('عند الرفض')).toBeInTheDocument()
    expect(screen.getByText('Junction box')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/po\.editReq\./)
  })

  it('has an Arabic string for every key and every field label', () => {
    const fields = [
      'notes',
      'expected_delivery_date',
      'description',
      'qty_ordered',
      'qty_from_stock',
      'unit_price',
      'actual_unit_price',
      'store_price',
      'store_price_currency',
      'uom',
      'currency_code',
      'vendor_id',
      'analytic_account_id',
    ]
    for (const f of fields) {
      expect(i18n.exists(`po.editReq.field.${f}`, { lng: 'ar', fallbackLng: false }), f).toBe(true)
    }
  })
})

describe('EditRequestCard: on a requisition', () => {
  it('says "requisition" wherever a PO would say "PO"', () => {
    renderCard(request({ changes: JSON.stringify({ lines: { removed: ['gone'] } }) }), { kind: 'requisition' })
    expect(screen.getByText(/Edits to a requisition that is already approved/)).toBeInTheDocument()
    expect(screen.getByText(/applied to this requisition/)).toBeInTheDocument()
    expect(screen.getByText(/The requisition stays exactly as it is/)).toBeInTheDocument()
    expect(screen.getByText(/A line that is no longer on this requisition/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\bPO\b/)
  })

  it('says an auto-applied requisition edit needed no review', () => {
    renderCard(
      request({ status: 'approved', auto_applied: true, reviewed_by: 'u-yazin', reviewed_at: '2026-10-22T12:00:00Z' }),
      { kind: 'requisition' },
    )
    expect(screen.getByText(/the requisition had not been approved yet/)).toBeInTheDocument()
  })

  it('keeps the PO wording for a PO', () => {
    renderCard(request())
    expect(screen.getByText(/Edits to a PO that is already approved/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/requisition/i)
  })

  it('hides Approve and Reject from someone who may not review, but still explains the request', () => {
    renderCard(request(), { kind: 'requisition', canReview: false })
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
    expect(screen.queryByPlaceholderText('Rejection reason (required)')).toBeNull()
    expect(screen.getByText('If approved')).toBeInTheDocument()
  })

  it('shows Approve and Reject by default', () => {
    renderCard(request(), { kind: 'requisition' })
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('shows priority and delivery destination by name, with readable labels', async () => {
    const changes = JSON.stringify({
      header: {
        priority: { from: 'low', to: 'emergency' },
        delivery_destination: { from: 'warehouse', to: 'jobsite' },
      },
    })
    renderCard(request({ changes }), { kind: 'requisition' })
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Delivery destination')).toBeInTheDocument()
    expect(screen.getByText('emergency')).toBeInTheDocument()
  })

  it('translates those header values in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const changes = JSON.stringify({ header: { priority: { from: 'low', to: 'emergency' } } })
    renderCard(request({ changes }), { kind: 'requisition' })
    expect(screen.getByText('منخفضة')).toBeInTheDocument()
    expect(screen.getByText('طارئ')).toBeInTheDocument()
    expect(screen.getByText('الأولوية')).toBeInTheDocument()
  })

  it('reads in Arabic as a requisition, not a PO', async () => {
    await i18n.changeLanguage('ar')
    renderCard(request(), { kind: 'requisition' })
    expect(screen.getAllByText(/طلب الشراء/).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/أمر الشراء/)
    expect(document.body.textContent).not.toMatch(/po\.editReq\./)
  })

  it('has every requisition variant and extra field label in both languages', () => {
    const keys = [
      ...['waitingForReview', 'appliedAutomatically', 'ifApproved', 'ifRejected', 'lineNotOnPo'].map(
        (k) => `po.editReq.${k}_requisition`,
      ),
      ...['priority', 'delivery_destination', 'branch_id'].map((f) => `po.editReq.field.${f}`),
    ]
    for (const lng of ['en', 'ar']) {
      for (const key of keys) {
        expect(i18n.exists(key, { lng, fallbackLng: false }), `${lng} ${key}`).toBe(true)
      }
    }
  })
})
