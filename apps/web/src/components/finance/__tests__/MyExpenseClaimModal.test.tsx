import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { MyExpenseClaimModal, type MyExpenseClaim } from '../MyExpenseClaimModal'

const apiGet = vi.fn()
const apiPost = vi.fn()
vi.mock('../../../lib/axios', () => ({
  api: {
    get: (...a: unknown[]): unknown => apiGet(...a),
    post: (...a: unknown[]): unknown => apiPost(...a),
  },
}))
// The receipts panel talks to Apollo; the popup only has to put it on screen.
vi.mock('../../inventory/EntityAttachments', () => ({
  EntityAttachments: () => <div data-testid="receipts-panel" />,
}))

const base: MyExpenseClaim = {
  id: 'claim-1',
  claim_number: 'EXP-2026-0043',
  description: 'Fuel run',
  notes: null,
  status: 'rejected',
  total_amount: '30000.00',
  currency_code: 'IQD',
  project_code: null,
  project_name: null,
  rejection_reason: '• Line 2 (Diesel): Price is wrong',
  can_revise: true,
  lines: [
    {
      id: 'l1',
      line_number: 1,
      expense_date: '2026-03-03',
      category_id: 'cat-1',
      category_name: 'Fuel',
      description: 'Taxi',
      amount: '10000.00',
      currency_code: 'IQD',
      flag_reason: null,
    },
    {
      id: 'l2',
      line_number: 2,
      expense_date: '2026-03-02',
      category_id: 'cat-1',
      category_name: 'Fuel',
      description: 'Diesel',
      amount: '20000.00',
      currency_code: 'IQD',
      flag_reason: 'Price is wrong',
      flagged_by_name: 'Sara',
    },
  ],
}

function renderModal(claim: MyExpenseClaim | null = base) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(
    <ThemeProvider>
      <MyExpenseClaimModal
        claim={claim}
        statusLabel="Rejected"
        statusVariant="danger"
        onClose={onClose}
        onChanged={onChanged}
      />
    </ThemeProvider>,
  )
  return { onClose, onChanged }
}

beforeEach(() => {
  apiGet.mockReset().mockResolvedValue({ data: [{ id: 'cat-1', name: 'Fuel' }] })
  apiPost.mockReset().mockResolvedValue({ data: {} })
})

describe('MyExpenseClaimModal (a plain employee looking at their own claim)', () => {
  it('shows why it was rejected, which line is flagged, and who flagged it', () => {
    renderModal()
    expect(screen.getByText(/Line 2 \(Diesel\): Price is wrong/)).toBeInTheDocument()
    expect(screen.getByText('Flagged by Sara')).toBeInTheDocument()
    expect(
      screen.getByText('This claim was sent back. Fix the flagged lines, then resubmit it.'),
    ).toBeInTheDocument()
  })

  it('numbers the lines with their stored numbers', () => {
    renderModal()
    const rows = screen.getAllByTestId('my-claim-line')
    expect(rows.map((r) => r.firstElementChild?.textContent)).toEqual(['1', '2'])
  })

  it('offers Edit & resubmit plus the receipts panel when the server allows an edit', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Edit & resubmit' })).toBeInTheDocument()
    expect(screen.getByTestId('receipts-panel')).toBeInTheDocument()
  })

  it('offers neither when the claim cannot be revised (it is with the approver)', () => {
    renderModal({ ...base, status: 'submitted', can_revise: false, rejection_reason: '• old' })
    // No Edit button of any wording, and no live "Rejected:" banner for a claim that is not rejected.
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Rejected:')).not.toBeInTheDocument()
    expect(screen.queryByTestId('receipts-panel')).not.toBeInTheDocument()
    // Not rejected any more: no live red banner.
    expect(
      screen.queryByText('This claim was sent back. Fix the flagged lines, then resubmit it.'),
    ).not.toBeInTheDocument()
  })

  it('edits and resubmits through the shared editor, then tells the page to reload', async () => {
    const { onChanged } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Edit & resubmit' }))
    expect(await screen.findByTestId('expense-claim-editor')).toBeInTheDocument()
    fireEvent.change(screen.getAllByLabelText('Amount')[1], { target: { value: '15000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save & resubmit' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    const [url, body] = apiPost.mock.calls[0] as [
      string,
      { resubmit: boolean; lines: { id: string; amount: number }[] },
    ]
    expect(url).toBe('/finance/expense-claims/claim-1/revise')
    expect(body.resubmit).toBe(true)
    expect(body.lines.map((l) => [l.id, l.amount])).toEqual([
      ['l1', 10000],
      ['l2', 15000],
    ])
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
  })

  it('Cancel in the editor goes back to reading the claim', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Edit & resubmit' }))
    await screen.findByTestId('expense-claim-editor')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('expense-claim-editor')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('my-claim-line')).toHaveLength(2)
  })

  it('renders nothing when there is no claim', () => {
    renderModal(null)
    expect(screen.queryByText('EXP-2026-0043')).not.toBeInTheDocument()
  })
})
