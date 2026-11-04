import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'

const apiGet = vi.fn()
const apiPost = vi.fn()
vi.mock('../../../../lib/axios', () => ({
  api: {
    get: (...a: unknown[]): unknown => apiGet(...a),
    post: (...a: unknown[]): unknown => apiPost(...a),
  },
}))

let perms: Record<string, boolean> = {}
vi.mock('../../../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: (key: string) => !!perms[key],
    canAny: () => false,
    isSystemLevel: false,
  }),
}))
vi.mock('../../../../hooks/useCompany', () => ({
  useCompany: () => ({ activeCompany: { name: 'Test Co' } }),
}))
// The attachments panel talks to Apollo; it is not what these tests are about.
vi.mock('../../../../components/inventory/EntityAttachments', () => ({
  EntityAttachments: () => null,
}))

function line(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `l${n}`,
    line_number: n,
    expense_date: `2026-03-0${n}`,
    category_id: 'cat-1',
    category_name: 'Fuel',
    account_code: '5700',
    account_name: 'Fuel expense',
    description: `Item ${n}`,
    amount: 1000 * n,
    currency_code: 'IQD',
    flag_reason: null,
    flagged_by_name: null,
    flag_addressed_at: null,
    flag_resolved_at: null,
    ...over,
  }
}

function claim(over: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    claim_number: 'EXP-2026-0043',
    employee_id: 'emp-1',
    employee_name: 'Nadia',
    description: null,
    total_amount: 6000,
    currency_code: 'IQD',
    status: 'submitted',
    notes: null,
    submitted_at: '2026-03-04T00:00:00Z',
    approved_at: null,
    approved_by_name: null,
    rejected_at: null,
    rejected_by_name: null,
    rejection_reason: null,
    audited_at: null,
    audited_by_name: null,
    audit_fail_reason: null,
    paid_at: null,
    paid_by_name: null,
    created_by_name: 'Nadia',
    journal_entry_id: null,
    created_at: '2026-03-04T00:00:00Z',
    reimbursement_account_id: null,
    project_id: null,
    project_code: null,
    project_name: null,
    funding_source: null,
    petty_cash_float_name: null,
    settlement_number: null,
    advance_number: null,
    receipt_pending: false,
    has_receipt: true,
    can_revise: false,
    lines: [line(1), line(2), line(3)],
    ...over,
  }
}

async function openClaim(c: Record<string, unknown>) {
  apiGet.mockImplementation((url: string) =>
    Promise.resolve({ data: url.endsWith('/categories/mine') ? [] : c }),
  )
  const { default: ExpenseClaimDetail } = await import('../ExpenseClaimDetail')
  render(
    <MemoryRouter initialEntries={['/finance/expense-claims/claim-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/finance/expense-claims/:id" element={<ExpenseClaimDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  // The number appears in the header and in the details table.
  await screen.findAllByText('EXP-2026-0043')
}

beforeEach(() => {
  apiGet.mockReset()
  apiPost.mockReset().mockResolvedValue({ data: {} })
  perms = {}
})

describe('ExpenseClaimDetail: line numbers', () => {
  it('shows each line with its stored number', async () => {
    await openClaim(claim({ lines: [line(1), line(2), line(4)] }))
    const rows = screen.getAllByTestId('expense-line-row')
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2', '4'])
  })
})

describe('ExpenseClaimDetail: rejecting with ticked lines', () => {
  beforeEach(() => {
    perms = { 'finance.expenses.approve': true, 'finance.expenses.view': true }
  })

  it('has no tick boxes until Reject is pressed, then one per line', async () => {
    await openClaim(claim())
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('needs a reason for every ticked line before it can reject', async () => {
    await openClaim(claim())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const reject = screen.getByRole('button', { name: 'Reject Claim' })
    // Nothing ticked and no overall reason.
    expect(reject).toBeDisabled()

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    // Ticked, but no reason for it yet.
    expect(reject).toBeDisabled()
    expect(screen.getByText('A reason is needed for each flagged line.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('What is wrong with this line?'), {
      target: { value: 'Price is wrong' },
    })
    expect(reject).toBeEnabled()
  })

  it('sends the ticked lines with their own reasons and no claim-level reason', async () => {
    await openClaim(claim())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getAllByRole('checkbox')[2])
    const boxes = screen.getAllByLabelText('What is wrong with this line?')
    fireEvent.change(boxes[0], { target: { value: 'No receipt' } })
    fireEvent.change(boxes[1], { target: { value: 'Price is wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject Claim' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1)
    })
    expect(apiPost).toHaveBeenCalledWith('/finance/expense-claims/claim-1/reject', {
      reason: undefined,
      lineFlags: [
        { lineId: 'l1', reason: 'No receipt' },
        { lineId: 'l3', reason: 'Price is wrong' },
      ],
    })
  })

  it('shows one reason field at a time: the claim-level one until a line is ticked, then the lines', async () => {
    await openClaim(claim())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByPlaceholderText('Reason for rejection...')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(screen.queryByPlaceholderText('Reason for rejection...')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('What is wrong with this line?')).toHaveLength(1)

    // Unticking the only line brings the claim-level field back.
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByPlaceholderText('Reason for rejection...')).toBeInTheDocument()
    expect(screen.queryByLabelText('What is wrong with this line?')).not.toBeInTheDocument()
  })

  it('does not send a claim-level reason that was typed before a line was ticked', async () => {
    await openClaim(claim())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection...'), {
      target: { value: 'typed first' },
    })
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.change(screen.getByLabelText('What is wrong with this line?'), {
      target: { value: 'No receipt' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject Claim' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith('/finance/expense-claims/claim-1/reject', {
      reason: undefined,
      lineFlags: [{ lineId: 'l1', reason: 'No receipt' }],
    })
  })

  it('still rejects the whole claim with only an overall reason', async () => {
    await openClaim(claim())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection...'), {
      target: { value: 'Wrong company' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject Claim' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith('/finance/expense-claims/claim-1/reject', {
      reason: 'Wrong company',
      lineFlags: [],
    })
  })

  it('Cancel closes the panel and forgets the ticks', async () => {
    await openClaim(claim())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false)
  })

  it('does not offer Reject to someone without the approve permission', async () => {
    perms = { 'finance.expenses.view': true }
    await openClaim(claim())
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })
})

describe('ExpenseClaimDetail: a sent-back claim', () => {
  const rejected = (over: Record<string, unknown> = {}) =>
    claim({
      status: 'rejected',
      rejected_at: '2026-03-05T00:00:00Z',
      rejection_reason: '• Line 2 (Item 2): Price is wrong',
      lines: [
        line(1),
        line(2, { flag_reason: 'Price is wrong', flagged_by_name: 'Sara' }),
        line(3),
      ],
      ...over,
    })

  it('shows the live reason, the flagged line with who flagged it, and Edit & resubmit to the owner', async () => {
    perms = { 'finance.expenses.view': true }
    await openClaim(rejected({ can_revise: true }))
    expect(screen.getByText(/Line 2 \(Item 2\): Price is wrong/)).toBeInTheDocument()
    expect(screen.getByText('Flagged by Sara')).toBeInTheDocument()
    expect(
      screen.getByText('This claim was sent back. Fix the flagged lines, then resubmit it.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit & resubmit' })).toBeInTheDocument()
  })

  it('does not show Edit to someone the server did not allow', async () => {
    perms = { 'finance.expenses.view': true, 'finance.expenses.edit': true }
    await openClaim(rejected({ can_revise: false }))
    expect(screen.queryByRole('button', { name: 'Edit & resubmit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('opens the shared editor when Edit & resubmit is pressed', async () => {
    perms = { 'finance.expenses.view': true }
    await openClaim(rejected({ can_revise: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit & resubmit' }))
    expect(await screen.findByTestId('expense-claim-editor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save & resubmit' })).toBeInTheDocument()
  })

  it('after a resubmit the old rejection is history and the fixed line waits for the approver', async () => {
    perms = { 'finance.expenses.view': true, 'finance.expenses.approve': true }
    await openClaim(
      rejected({
        status: 'submitted',
        lines: [
          line(1),
          line(2, {
            flag_reason: 'Price is wrong',
            flagged_by_name: 'Sara',
            flag_addressed_at: '2026-03-06T00:00:00Z',
          }),
          line(3),
        ],
      }),
    )
    expect(screen.getByText('Previously rejected:')).toBeInTheDocument()
    // The old rejection is history now: no live red "Rejected:" banner on a claim that is back with the approver.
    expect(screen.queryByText('Rejected:')).not.toBeInTheDocument()
    expect(screen.getByText('Fixed, awaiting confirmation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm fixed' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/finance/expense-claims/claim-1/lines/l2/resolve-flag',
        {},
      )
    })
  })

  it('does not offer to confirm a flag the employee has not fixed yet', async () => {
    perms = { 'finance.expenses.view': true, 'finance.expenses.approve': true }
    await openClaim(
      rejected({
        status: 'submitted',
        lines: [line(1), line(2, { flag_reason: 'Price is wrong' }), line(3)],
      }),
    )
    expect(screen.getByText('Flagged')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm fixed' })).not.toBeInTheDocument()
  })

  it('only the approver sees the confirm button, not the owner', async () => {
    perms = { 'finance.expenses.view': true }
    await openClaim(
      rejected({
        status: 'submitted',
        lines: [
          line(1),
          line(2, { flag_reason: 'Price is wrong', flag_addressed_at: '2026-03-06T00:00:00Z' }),
          line(3),
        ],
      }),
    )
    expect(screen.getByText('Fixed, awaiting confirmation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm fixed' })).not.toBeInTheDocument()
  })
})
