// The Edit Request History card on a PO or requisition. It used to show "line qty ordered
// 1.0000 → 540" and "− 1 line removed" with no way to tell which line, the requester's email only,
// and (in its first rework) generic "if approved / if rejected" sentences that said nothing about
// the request in front of the reviewer. It now shows what matters about THIS request: the reason
// given, each change under its line's index and details with how far it moved, what it does to the
// totals, and who reviewed it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { PO_EDIT_REQUEST_IMPACT_QUERY } from '../../../graphql/procurement'
import { EditRequestCard, type EditRequestView } from '../EditRequestCard'

const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return { ...actual, useQuery: (...args: unknown[]): unknown => mockUseQuery(...args) }
})

const onPo = [
  { id: 'cable', description: 'Cable 3x2.5', line_number: 1 },
  { id: 'box', description: 'Junction box', line_number: 2 },
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

// What the gateway answers for a pending request's impact; undefined = no answer.
function answerImpact(impact: unknown, loading = false) {
  mockUseQuery.mockImplementation((doc: unknown, opts?: { skip?: boolean }) => {
    if (doc === PO_EDIT_REQUEST_IMPACT_QUERY && !opts?.skip)
      return { data: impact === undefined ? undefined : { poEditRequestImpact: impact }, loading }
    return { data: undefined, loading: false }
  })
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

beforeEach(() => {
  vi.clearAllMocks()
  answerImpact(undefined)
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

const touchedCable = {
  id: 'cable',
  line_number: 1,
  description: 'Cable 3x2.5',
  qty: 12,
  unit_price: 4500,
  uom: 'm',
  currency_code: 'IQD',
  total: 54000,
}

describe('EditRequestCard: the reason', () => {
  it('shows the reason the requester gave', () => {
    renderCard(request({ request_notes: 'Supplier cancelled the box' }))
    expect(screen.getByText('Reason for the change')).toBeInTheDocument()
    expect(screen.getByText(/Supplier cancelled the box/)).toBeInTheDocument()
  })

  it('says so when no reason was given, instead of leaving a gap', () => {
    renderCard(request())
    expect(screen.getByText('No reason was given.')).toBeInTheDocument()
  })
})

describe('EditRequestCard: which line, and what changed on it', () => {
  it("shows the line's index and name with its details as they were", () => {
    renderCard(
      request({
        changes: JSON.stringify({
          touched: [touchedCable],
          lines: { edited: [{ id: 'cable', field: 'qty_ordered', from: '12.0000', to: 20 }] },
        }),
      }),
    )
    expect(screen.getByText(/#1/)).toBeInTheDocument()
    expect(screen.getByText('Cable 3x2.5')).toBeInTheDocument()
    expect(screen.getByText('12 m × 4,500 IQD = 54,000 IQD')).toBeInTheDocument()
    expect(screen.getByText('Quantity')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument() // 12.0000 -> 12
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.queryByText(/line qty ordered/)).toBeNull()
  })

  it('shows how far a quantity or price moved', () => {
    renderCard(
      request({
        changes: JSON.stringify({
          touched: [touchedCable],
          lines: {
            edited: [
              { id: 'cable', field: 'qty_ordered', from: 12, to: 20 },
              { id: 'cable', field: 'unit_price', from: 9000, to: 4000 },
              { id: 'cable', field: 'uom', from: 'm', to: 'ft' },
            ],
          },
        }),
      }),
    )
    expect(screen.getByText('+66.7%')).toBeInTheDocument()
    expect(screen.getByText('-55.6%')).toBeInTheDocument()
    expect(screen.getAllByText(/%$/)).toHaveLength(2) // the unit change has no percentage
  })

  it('takes the index of an older request from the lines still on the PO', () => {
    renderCard(
      request({
        changes: JSON.stringify({
          lines: { edited: [{ id: 'box', field: 'qty_ordered', from: 3, to: 4 }] },
        }),
      }),
    )
    expect(screen.getByText(/#2/)).toBeInTheDocument()
    expect(screen.getByText('Junction box')).toBeInTheDocument()
  })

  it('shows a removed line with its index, name and what it was', () => {
    renderCard(
      request({
        changes: JSON.stringify({
          lines: {
            removed: [
              {
                id: 'box',
                line_number: 2,
                description: 'Junction box',
                qty: 3,
                unit_price: 900,
                uom: 'ea',
                currency_code: 'IQD',
              },
            ],
          },
        }),
      }),
    )
    expect(screen.getByText(/#2/)).toBeInTheDocument()
    expect(screen.getByText('Junction box')).toBeInTheDocument()
    expect(screen.getByText('3 ea × 900 IQD')).toBeInTheDocument()
  })

  it('names a removed line a pending request only knew by id, from the PO', () => {
    renderCard(request())
    expect(screen.getByText('Junction box')).toBeInTheDocument()
    expect(screen.getByText('1 change')).toBeInTheDocument()
  })

  it('says so when a line is gone and its name was never recorded', () => {
    renderCard(
      request({ status: 'approved', changes: JSON.stringify({ lines: { removed: ['gone'] } }) }),
    )
    expect(screen.getByText(/A line that is no longer on this PO/)).toBeInTheDocument()
    expect(screen.getByText('(name was not recorded)')).toBeInTheDocument()
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
    expect(screen.getByText('100 ea × 25')).toBeInTheDocument()
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

describe('EditRequestCard: the effect on the totals', () => {
  const changes = JSON.stringify({
    touched: [touchedCable],
    lines: { edited: [{ id: 'cable', field: 'qty_ordered', from: 12, to: 20 }] },
  })
  const impact = {
    totals: [
      { currency_code: 'IQD', before: '56700.0000', after: '92700.0000' },
      { currency_code: 'USD', before: '100.0000', after: '100.0000' },
    ],
    lines: [
      {
        id: 'cable',
        line_number: 1,
        description: 'Cable 3x2.5',
        currency_code: 'IQD',
        before: 54000,
        after: 90000,
      },
    ],
    failure: null,
  }

  it('shows the total before and after for each currency that changes, and the line total', () => {
    answerImpact(impact)
    renderCard(request({ changes }))
    expect(screen.getByText('Effect on total')).toBeInTheDocument()
    expect(screen.getByText('PO total')).toBeInTheDocument()
    expect(screen.getByText('56,700')).toBeInTheDocument()
    expect(screen.getByText('92,700 IQD')).toBeInTheDocument()
    expect(screen.getByText('(+36,000)')).toBeInTheDocument()
    expect(screen.getByText('Line total')).toBeInTheDocument()
    expect(screen.getByText('54,000 IQD')).toBeInTheDocument()
    expect(screen.getByText('90,000 IQD')).toBeInTheDocument()
    expect(screen.queryByText(/USD/)).toBeNull() // that currency did not change
  })

  it('shows a decrease as a decrease', () => {
    answerImpact({
      totals: [{ currency_code: 'IQD', before: '56700', after: '54000' }],
      lines: [],
      failure: null,
    })
    renderCard(request())
    expect(screen.getByText('(−2,700)')).toBeInTheDocument()
  })

  it('asks the server only for a pending request', () => {
    renderCard(request({ status: 'approved' }))
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true }),
    )
  })

  it('says approving would fail, and why, instead of showing totals', () => {
    answerImpact({ totals: [], lines: [], failure: 'No PO exchange rate configured for USD → IQD' })
    renderCard(request())
    expect(
      screen.getByText(/Approving this would fail right now: No PO exchange rate configured/),
    ).toBeInTheDocument()
    expect(screen.queryByText('PO total')).toBeNull()
  })

  it('says the totals do not change when nothing moves', () => {
    answerImpact({
      totals: [{ currency_code: 'IQD', before: '100', after: '100' }],
      lines: [],
      failure: null,
    })
    renderCard(request())
    expect(screen.getByText('The totals do not change.')).toBeInTheDocument()
  })

  it('says it is working it out while the server answers', () => {
    answerImpact(undefined, true)
    renderCard(request())
    expect(screen.getByText('Working out the effect on the total…')).toBeInTheDocument()
  })

  it('shows nothing about the total when the server has none (a non-reviewer)', () => {
    answerImpact(null)
    renderCard(request())
    expect(screen.queryByText('Effect on total')).toBeNull()
    expect(screen.queryByText('Working out the effect on the total…')).toBeNull()
  })

  it('shows the impact recorded with a reviewed request', () => {
    renderCard(
      request({
        status: 'approved',
        reviewed_by: 'u-nadia',
        reviewed_by_name: 'Nadia Saleh',
        changes: JSON.stringify({
          impact: {
            totals: [{ currency_code: 'IQD', before: '56700', after: '54000' }],
            lines: [],
          },
          lines: { removed: ['box'] },
        }),
      }),
    )
    expect(screen.getByText('Effect on total')).toBeInTheDocument()
    expect(screen.getByText('(−2,700)')).toBeInTheDocument()
  })
})

describe('EditRequestCard: the generic rows are gone', () => {
  it('does not repeat what every edit request does', () => {
    answerImpact({ totals: [], lines: [], failure: null })
    renderCard(request())
    for (const text of ['If approved', 'If rejected', 'Review'])
      expect(screen.queryByText(text)).toBeNull()
    expect(document.body.textContent).not.toMatch(
      /totals are recalculated|stays exactly as it is|already approved need an admin/,
    )
  })
})

describe('EditRequestCard: who and when', () => {
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

  it('shows no reviewer row while it is pending', () => {
    renderCard(request())
    expect(screen.queryByText('Reviewed')).toBeNull()
  })
})

describe('EditRequestCard: approving and rejecting', () => {
  it('has no controls once reviewed', () => {
    renderCard(request({ status: 'approved', reviewed_by: 'u-n', reviewed_by_name: 'N' }))
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
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

describe('EditRequestCard: on a requisition', () => {
  it('says "requisition" wherever a PO would say "PO"', () => {
    answerImpact({
      totals: [{ currency_code: 'IQD', before: '100', after: '60' }],
      lines: [],
      failure: null,
    })
    renderCard(request({ changes: JSON.stringify({ lines: { removed: ['gone'] } }) }), {
      kind: 'requisition',
    })
    expect(screen.getByText('Requisition total')).toBeInTheDocument()
    expect(screen.getByText(/A line that is no longer on this requisition/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\bPO\b/)
  })

  it('says an auto-applied requisition edit needed no review', () => {
    renderCard(
      request({
        status: 'approved',
        auto_applied: true,
        reviewed_by: 'u-yazin',
        reviewed_at: '2026-10-22T12:00:00Z',
      }),
      { kind: 'requisition' },
    )
    expect(screen.getByText(/the requisition had not been approved yet/)).toBeInTheDocument()
  })

  it('hides Approve and Reject from someone who may not review, but still shows the request', () => {
    renderCard(request({ request_notes: 'Why' }), { kind: 'requisition', canReview: false })
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
    expect(screen.queryByPlaceholderText('Rejection reason (required)')).toBeNull()
    expect(screen.getByText(/Why/)).toBeInTheDocument()
  })

  it('shows priority and delivery destination by name, with readable labels', () => {
    renderCard(
      request({
        changes: JSON.stringify({
          header: {
            priority: { from: 'low', to: 'emergency' },
            delivery_destination: { from: 'warehouse', to: 'jobsite' },
          },
        }),
      }),
      { kind: 'requisition' },
    )
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Delivery destination')).toBeInTheDocument()
    expect(screen.getByText('emergency')).toBeInTheDocument()
  })
})

describe('EditRequestCard: Arabic', () => {
  it('shows the card in Arabic without any raw translation keys', async () => {
    await i18n.changeLanguage('ar')
    answerImpact({
      totals: [{ currency_code: 'IQD', before: '100', after: '60' }],
      lines: [],
      failure: null,
    })
    renderCard(request({ request_notes: 'سبب' }))
    expect(screen.getByText('سبب التعديل')).toBeInTheDocument()
    expect(screen.getByText('الأثر على الإجمالي')).toBeInTheDocument()
    expect(screen.getByText('إجمالي أمر الشراء')).toBeInTheDocument()
    expect(screen.getByText('Junction box')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/po\.editReq\./)
  })

  it('reads as a requisition, not a PO', async () => {
    await i18n.changeLanguage('ar')
    answerImpact({
      totals: [{ currency_code: 'IQD', before: '100', after: '60' }],
      lines: [],
      failure: null,
    })
    renderCard(request(), { kind: 'requisition' })
    expect(screen.getByText('إجمالي طلب الشراء')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/أمر الشراء/)
  })

  it('translates the priority values', async () => {
    await i18n.changeLanguage('ar')
    renderCard(
      request({
        changes: JSON.stringify({ header: { priority: { from: 'low', to: 'emergency' } } }),
      }),
      { kind: 'requisition' },
    )
    expect(screen.getByText('منخفضة')).toBeInTheDocument()
    expect(screen.getByText('طارئ')).toBeInTheDocument()
    expect(screen.getByText('الأولوية')).toBeInTheDocument()
  })

  it('has every string in both languages, including the requisition wording and every field label', () => {
    const keys = [
      'labelReason',
      'labelChanges',
      'labelImpact',
      'labelReviewed',
      'noReasonGiven',
      'noDetail',
      'noTotalChange',
      'impactLoading',
      'impactFailure',
      'lineTotal',
      'newLine',
      'nameNotRecorded',
      'showAll',
      'showFewer',
      'approvedBy',
      'rejectedBy',
      'rejectedReason',
      'reviewedByRequester',
      'unknownUser',
      'appliedAutomatically',
      'appliedAutomatically_requisition',
      'lineNotOnPo',
      'lineNotOnPo_requisition',
      'totalLabel',
      'totalLabel_requisition',
      ...[
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
        'priority',
        'delivery_destination',
        'branch_id',
      ].map((f) => `field.${f}`),
    ].map((k) => `po.editReq.${k}`)
    for (const lng of ['en', 'ar']) {
      for (const key of keys)
        expect(i18n.exists(key, { lng, fallbackLng: false }), `${lng} ${key}`).toBe(true)
    }
  })
})
