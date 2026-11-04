import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { ExpenseClaimEditor, type EditableClaim } from '../ExpenseClaimEditor'

const apiGet = vi.fn()
const apiPost = vi.fn()
vi.mock('../../../lib/axios', () => ({
  api: {
    get: (...a: unknown[]): unknown => apiGet(...a),
    post: (...a: unknown[]): unknown => apiPost(...a),
  },
}))

const claim: EditableClaim = {
  id: 'claim-1',
  status: 'rejected',
  description: 'Site trip',
  notes: null,
  currency_code: 'IQD',
  lines: [
    {
      id: 'l1',
      line_number: 1,
      expense_date: '2026-03-03',
      category_id: 'cat-fuel',
      category_name: 'Fuel',
      description: 'Taxi',
      amount: '10000.00',
    },
    {
      id: 'l2',
      line_number: 2,
      expense_date: '2026-03-02',
      category_id: 'cat-fuel',
      category_name: 'Fuel',
      description: 'Diesel',
      amount: '20000.00',
      flag_reason: 'Price is wrong',
    },
    {
      id: 'l4',
      line_number: 4,
      expense_date: '2026-03-01',
      category_id: null,
      category_name: null,
      description: 'Lunch',
      amount: '5000.00',
      // Confirmed by the approver last time: no longer shown as something to fix.
      flag_reason: 'Old problem',
      flag_resolved_at: '2026-03-05T00:00:00Z',
    },
  ],
}

function renderEditor(over: Partial<EditableClaim> = {}) {
  const onSaved = vi.fn()
  const onCancel = vi.fn()
  render(
    <ThemeProvider>
      <ExpenseClaimEditor claim={{ ...claim, ...over }} onSaved={onSaved} onCancel={onCancel} />
    </ThemeProvider>,
  )
  return { onSaved, onCancel }
}

beforeEach(() => {
  apiGet.mockReset().mockResolvedValue({ data: [{ id: 'cat-fuel', name: 'Fuel' }] })
  apiPost.mockReset().mockResolvedValue({ data: {} })
})

describe('ExpenseClaimEditor', () => {
  it("shows each line's stored number, not its position, and the self-service category list", async () => {
    renderEditor()
    expect(screen.getAllByTestId('expense-editor-line')).toHaveLength(3)
    // Line 3 was removed earlier: the third row is still "4", not "3".
    expect(screen.getAllByTestId('expense-editor-line-number').map((n) => n.textContent)).toEqual([
      '1',
      '2',
      '4',
    ])
    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/finance/expense-claims/categories/mine')
    })
  })

  it('tells the employee what to fix on a flagged line, and only for a live flag', () => {
    renderEditor()
    expect(screen.getByText('Fix this: Price is wrong')).toBeInTheDocument()
    expect(screen.queryByText(/Old problem/)).not.toBeInTheDocument()
  })

  it('saves lines by id with their current category (none for a legacy line without one), and does not resubmit', async () => {
    const { onSaved } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1)
    })
    const [url, body] = apiPost.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/finance/expense-claims/claim-1/revise')
    expect(body.resubmit).toBe(false)
    const lines = body.lines as Record<string, unknown>[]
    expect(lines.map((l) => l.id)).toEqual(['l1', 'l2', 'l4'])
    // The server keeps a line's account when the category is the one it already has.
    expect(lines.map((l) => l.category_id)).toEqual(['cat-fuel', 'cat-fuel', undefined])
    expect(lines[0]).toMatchObject({
      expense_date: '2026-03-03',
      description: 'Taxi',
      amount: 10000,
    })
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
  })

  it('resubmits from "Save & resubmit" on a rejected claim, "Save & submit" on a draft', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Save & resubmit' }))
    return waitFor(() => {
      expect((apiPost.mock.calls[0] as [string, Record<string, unknown>])[1].resubmit).toBe(true)
    })
  })

  it('uses the draft wording on a draft', () => {
    renderEditor({ status: 'draft' })
    expect(screen.getByRole('button', { name: 'Save & submit for approval' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save & resubmit' })).not.toBeInTheDocument()
  })

  it('a new line needs a category: nothing is sent', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    const amounts = screen.getAllByLabelText('Amount')
    fireEvent.change(amounts[amounts.length - 1], { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Every line needs a date, a category and an amount above zero.',
    )
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('refuses a zero amount', () => {
    renderEditor()
    fireEvent.change(screen.getAllByLabelText('Amount')[0], { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('a removed line is left out of what is sent', async () => {
    renderEditor()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[2])
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    const lines = (apiPost.mock.calls[0] as [string, { lines: { id: string }[] }])[1].lines
    expect(lines.map((l) => l.id)).toEqual(['l1', 'l2'])
  })

  it('cannot remove the last line', () => {
    renderEditor({ lines: [claim.lines[0]] })
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it("shows the server's message when the save is refused", async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        data: { error: { message: 'Only the person who filed this claim can edit it' } },
      },
    })
    const { onSaved } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the person who filed this claim can edit it',
    )
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('Cancel leaves without saving', () => {
    const { onCancel } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(apiPost).not.toHaveBeenCalled()
  })
})
