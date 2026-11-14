// The cashbox handler's dialog: pick the cashbox the cash comes out of and pay an approved advance.
// The server decides which cashboxes can pay (cashboxProblem) and refuses the rest; the dialog shows each one's reason up
// front so nobody picks a box only to be refused, and never lets the button fire without a choice.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { IssueAdvanceModal } from '../IssueAdvanceModal'

const apiGet = vi.fn()
const apiPost = vi.fn()
vi.mock('../../../lib/axios', () => ({
  api: {
    get: (...a: unknown[]): unknown => apiGet(...a),
    post: (...a: unknown[]): unknown => apiPost(...a),
  },
}))

type Problem =
  | 'CASHBOX_INACTIVE'
  | 'CURRENCY_MISMATCH'
  | 'NO_GL_ACCOUNT'
  | 'INSUFFICIENT_BALANCE'
  | null

const box = (
  id: string,
  name: string,
  over: Record<string, unknown> = {},
  problem: Problem = null,
) => ({
  id,
  name,
  location: 'Erbil office',
  custodian_name: 'Hana',
  currency_code: 'IQD',
  current_balance: 5_000_000,
  problem,
  ...over,
})

function options(
  cashboxes = [box('box-a', 'Main cashbox'), box('box-b', 'Site cashbox', { location: null })],
) {
  return {
    advance: {
      id: 'adv-1',
      advance_number: 'ADV-0007',
      employee_name: 'Nadia Saleh',
      purpose: 'Site fuel',
      amount: 200000,
      currency_code: 'IQD',
      project_code: 'PRJ-1',
      project_name: 'Tower',
      cost_center_id: null,
    },
    cashboxes,
    cost_centers: [],
  }
}

function mount(advanceId: string | null = 'adv-1') {
  const onClose = vi.fn()
  const onIssued = vi.fn()
  const view = render(
    <ThemeProvider>
      <IssueAdvanceModal advanceId={advanceId} onClose={onClose} onIssued={onIssued} />
    </ThemeProvider>,
  )
  return { onClose, onIssued, ...view }
}

const toasts = () => useToastStore.getState().toasts.map((t) => `${t.variant}: ${t.message}`)

beforeEach(() => {
  apiGet.mockReset().mockResolvedValue({ data: options() })
  apiPost.mockReset().mockResolvedValue({ data: {} })
  useToastStore.setState({ toasts: [] })
})

describe('IssueAdvanceModal', () => {
  it('loads the options for that advance and shows who it is for, the amount and every cashbox with its balance', async () => {
    mount()
    expect(await screen.findByText('Nadia Saleh')).toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith('/finance/advances/adv-1/issue-options')
    expect(screen.getByText('Issue advance ADV-0007')).toBeInTheDocument()
    expect(screen.getByText('PRJ-1 — Tower')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /main cashbox/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /site cashbox/i })).toBeInTheDocument()
    expect(screen.getByText('Erbil office · Held by Hana')).toBeInTheDocument() // location, then who holds it
    expect(screen.getByText('Held by Hana')).toBeInTheDocument() // a box with no location shows only the holder
    expect(screen.getAllByText('Balance')).toHaveLength(2)
  })

  it('does nothing and fetches nothing when no advance is open', () => {
    mount(null)
    expect(apiGet).not.toHaveBeenCalled()
    expect(screen.queryByText(/issue cash/i)).not.toBeInTheDocument()
  })

  it('names the amount on the confirm button and keeps it disabled until a cashbox is chosen', async () => {
    mount()
    await screen.findByText('Nadia Saleh')
    const confirm = screen.getByRole('button', { name: 'Issue 200,000 IQD' })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    expect(screen.getByRole('radio', { name: /main cashbox/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(confirm).toBeEnabled()
  })

  it('shows why a cashbox cannot pay it, disables it, and a click on it chooses nothing', async () => {
    apiGet.mockResolvedValue({
      data: options([
        box('box-a', 'Main cashbox'),
        box('box-usd', 'Dollar cashbox', { currency_code: 'USD' }, 'CURRENCY_MISMATCH'),
        box('box-low', 'Petty cashbox', { current_balance: 1000 }, 'INSUFFICIENT_BALANCE'),
        box('box-gl', 'Unlinked cashbox', {}, 'NO_GL_ACCOUNT'),
        box('box-off', 'Closed cashbox', {}, 'CASHBOX_INACTIVE'),
      ]),
    })
    mount()
    await screen.findByText('Nadia Saleh')
    expect(screen.getByText('In a different currency than the advance')).toBeInTheDocument()
    expect(screen.getByText('Not enough cash for this advance')).toBeInTheDocument()
    expect(screen.getByText('Has no GL account set up')).toBeInTheDocument()
    expect(screen.getByText('Not active')).toBeInTheDocument()
    for (const name of [/dollar/i, /petty/i, /unlinked/i, /closed/i]) {
      expect(screen.getByRole('radio', { name })).toBeDisabled()
    }
    fireEvent.click(screen.getByRole('radio', { name: /dollar/i }))
    expect(screen.getByRole('button', { name: 'Issue 200,000 IQD' })).toBeDisabled()
    // the usable one is still chosen normally
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    expect(screen.getByRole('button', { name: 'Issue 200,000 IQD' })).toBeEnabled()
  })

  it('issues from the chosen cashbox: posts its id, says so, and tells the page', async () => {
    const { onIssued } = mount()
    await screen.findByText('Nadia Saleh')
    fireEvent.click(screen.getByRole('radio', { name: /site cashbox/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Issue 200,000 IQD' }))
    await waitFor(() => {
      expect(onIssued).toHaveBeenCalledTimes(1)
    })
    expect(apiPost).toHaveBeenCalledTimes(1)
    expect(apiPost).toHaveBeenCalledWith('/finance/advances/adv-1/issue', {
      petty_cash_float_id: 'box-b',
    })
    expect(toasts()).toContain('success: Advance issued')
  })

  it("a refused issue keeps the dialog open and shows the server's reason", async () => {
    apiPost.mockRejectedValue({
      response: {
        data: { error: { message: 'The cashbox does not hold enough to issue this advance' } },
      },
    })
    const { onIssued } = mount()
    await screen.findByText('Nadia Saleh')
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Issue 200,000 IQD' }))
    await waitFor(() => {
      expect(toasts()).toContain('danger: The cashbox does not hold enough to issue this advance')
    })
    expect(onIssued).not.toHaveBeenCalled()
    // still choosable and still on screen: the handler can pick another box
    expect(screen.getByRole('radio', { name: /main cashbox/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issue 200,000 IQD' })).toBeEnabled()
  })

  it('falls back to a plain message when the server gives none', async () => {
    apiPost.mockRejectedValue(new Error('Network Error'))
    mount()
    await screen.findByText('Nadia Saleh')
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Issue 200,000 IQD' }))
    await waitFor(() => {
      expect(toasts()).toContain('danger: Could not issue the advance')
    })
  })

  it('does not post twice when the button is pressed again while the first is in flight', async () => {
    let finish: (v: unknown) => void = () => undefined
    apiPost.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { onIssued } = mount()
    await screen.findByText('Nadia Saleh')
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    const confirm = screen.getByRole('button', { name: 'Issue 200,000 IQD' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(apiPost).toHaveBeenCalledTimes(1)
    finish({ data: {} })
    await waitFor(() => {
      expect(onIssued).toHaveBeenCalledTimes(1)
    })
  })

  it('says so when the company has no cashbox at all, and offers no way to confirm', async () => {
    apiGet.mockResolvedValue({ data: options([]) })
    mount()
    expect(await screen.findByText(/no active cashbox/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issue 200,000 IQD' })).toBeDisabled()
  })

  it('says so when there are cashboxes but none can pay it', async () => {
    apiGet.mockResolvedValue({
      data: options([
        box('box-usd', 'Dollar cashbox', { currency_code: 'USD' }, 'CURRENCY_MISMATCH'),
      ]),
    })
    mount()
    expect(
      await screen.findByText(/none of the cashboxes can pay this advance/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issue 200,000 IQD' })).toBeDisabled()
  })

  it("shows the server's message when the options cannot be loaded (for example the advance is no longer waiting)", async () => {
    apiGet.mockRejectedValue({
      response: { data: { error: { message: 'Advance is not waiting to be issued' } } },
    })
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Advance is not waiting to be issued',
    )
    expect(screen.getByRole('button', { name: 'Issue cash' })).toBeDisabled()
  })

  it('forgets the chosen cashbox when it is opened for another advance', async () => {
    const view = mount('adv-1')
    await screen.findByText('Nadia Saleh')
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    expect(screen.getByRole('button', { name: 'Issue 200,000 IQD' })).toBeEnabled()
    apiGet.mockResolvedValue({
      data: {
        ...options(),
        advance: { ...options().advance, id: 'adv-2', advance_number: 'ADV-0008' },
      },
    })
    view.rerender(
      <ThemeProvider>
        <IssueAdvanceModal advanceId="adv-2" onClose={view.onClose} onIssued={view.onIssued} />
      </ThemeProvider>,
    )
    await screen.findByText('Issue advance ADV-0008')
    expect(screen.getByRole('radio', { name: /main cashbox/i })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Issue 200,000 IQD' })).toBeDisabled()
  })

  it('Cancel closes without issuing anything', async () => {
    const { onClose } = mount()
    await screen.findByText('Nadia Saleh')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(apiPost).not.toHaveBeenCalled()
  })
})

describe('IssueAdvanceModal: the cost center', () => {
  const costCenters = [
    { id: 'cc-1', code: 'OPS', name: 'Operations' },
    { id: 'cc-2', code: 'ADM', name: 'Administration' },
  ]
  const withCostCenters = (current: string | null = null) => {
    const base = options()
    return {
      ...base,
      advance: { ...base.advance, cost_center_id: current },
      cost_centers: costCenters,
    }
  }
  const costCenterBox = () =>
    screen.getByDisplayValue<HTMLSelectElement>(/not set|operations|administration/i)

  it("is chosen here, by whoever pays the advance out, from the company's cost centers", async () => {
    apiGet.mockResolvedValue({ data: withCostCenters() })
    mount()
    await screen.findByText('Nadia Saleh')
    expect(screen.getByText('Cost Center (optional)')).toBeInTheDocument()
    const box = costCenterBox()
    expect([...box.options].map((o) => o.textContent)).toEqual([
      '— Not set —',
      'OPS · Operations',
      'ADM · Administration',
    ])
    expect(box.value).toBe('')
    expect(screen.getByText(/booked to it, and is refused without one/i)).toBeInTheDocument()
  })

  it('goes with the issue: the chosen cost center is posted with the cashbox', async () => {
    apiGet.mockResolvedValue({ data: withCostCenters() })
    const { onIssued } = mount()
    await screen.findByText('Nadia Saleh')
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    fireEvent.change(costCenterBox(), { target: { value: 'cc-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Issue 200,000 IQD' }))
    await waitFor(() => {
      expect(onIssued).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith('/finance/advances/adv-1/issue', {
      petty_cash_float_id: 'box-a',
      cost_center_id: 'cc-2',
    })
  })

  it('may be left empty: nothing is sent for it and the cash is not held back', async () => {
    apiGet.mockResolvedValue({ data: withCostCenters() })
    const { onIssued } = mount()
    await screen.findByText('Nadia Saleh')
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Issue 200,000 IQD' }))
    await waitFor(() => {
      expect(onIssued).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith('/finance/advances/adv-1/issue', {
      petty_cash_float_id: 'box-a',
      cost_center_id: undefined,
    })
  })

  it('starts on the cost center the advance already has, and sends it unless it is changed', async () => {
    apiGet.mockResolvedValue({ data: withCostCenters('cc-1') })
    mount()
    await screen.findByText('Nadia Saleh')
    expect(costCenterBox().value).toBe('cc-1')
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Issue 200,000 IQD' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith('/finance/advances/adv-1/issue', {
      petty_cash_float_id: 'box-a',
      cost_center_id: 'cc-1',
    })
  })

  it('is not offered when the company has no active cost center', async () => {
    apiGet.mockResolvedValue({ data: options() })
    mount()
    await screen.findByText('Nadia Saleh')
    expect(screen.queryByText('Cost Center (optional)')).not.toBeInTheDocument()
  })

  it('a refusal about the cost center is shown and the dialog stays open', async () => {
    apiGet.mockResolvedValue({ data: withCostCenters() })
    apiPost.mockRejectedValue({
      response: {
        data: { error: { message: 'Cost center not found in this company, or it is not active' } },
      },
    })
    const { onIssued } = mount()
    await screen.findByText('Nadia Saleh')
    fireEvent.click(screen.getByRole('radio', { name: /main cashbox/i }))
    fireEvent.change(costCenterBox(), { target: { value: 'cc-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Issue 200,000 IQD' }))
    await waitFor(() => {
      expect(toasts()).toContain(
        'danger: Cost center not found in this company, or it is not active',
      )
    })
    expect(onIssued).not.toHaveBeenCalled()
  })

  it('forgets the choice when opened for another advance', async () => {
    apiGet.mockResolvedValue({ data: withCostCenters() })
    const view = mount('adv-1')
    await screen.findByText('Nadia Saleh')
    fireEvent.change(costCenterBox(), { target: { value: 'cc-2' } })
    expect(costCenterBox().value).toBe('cc-2')
    const next = withCostCenters()
    apiGet.mockResolvedValue({
      data: { ...next, advance: { ...next.advance, id: 'adv-2', advance_number: 'ADV-0008' } },
    })
    view.rerender(
      <ThemeProvider>
        <IssueAdvanceModal advanceId="adv-2" onClose={view.onClose} onIssued={view.onIssued} />
      </ThemeProvider>,
    )
    await screen.findByText('Issue advance ADV-0008')
    expect(costCenterBox().value).toBe('')
  })
})
