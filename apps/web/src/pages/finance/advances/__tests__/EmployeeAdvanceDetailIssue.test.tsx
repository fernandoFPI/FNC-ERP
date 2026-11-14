// The Finance advance page after the approve / issue split. The manager's Approve no longer pays anything: it moves the
// advance to "awaiting cash issue". The cashbox handler's Issue cash picks the cashbox and pays it out. An unpaid approval can
// be cancelled, a rejected request can be corrected by whoever filed it, and a refused action says why (it used to be swallowed).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { useToastStore } from '../../../../store/toastStore'

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

const advance = (over: Record<string, unknown> = {}) => ({
  id: 'adv-1',
  advance_number: 'ADV-0007',
  employee_name: 'Nadia Saleh',
  purpose: 'Site fuel',
  project_id: null,
  cost_center_id: null,
  amount: 200000,
  settled_amount: 0,
  returned_amount: 0,
  outstanding_amount: 200000,
  currency_code: 'IQD',
  status: 'pending_approval',
  cash_account_id: 'cash-1',
  advance_account_id: 'adv-acc-1',
  notes: null,
  rejection_reason: null,
  void_reason: null,
  journal_entry_id: null,
  created_at: '2026-03-01T00:00:00Z',
  submitted_at: null,
  approved_at: null,
  issued_at: null,
  cashbox_name: null,
  project_code: null,
  project_name: null,
  can_revise: false,
  settlements: [],
  returns: [],
  ...over,
})

const issueOptions = {
  advance: {
    id: 'adv-1',
    advance_number: 'ADV-0007',
    employee_name: 'Nadia Saleh',
    purpose: 'Site fuel',
    amount: 200000,
    currency_code: 'IQD',
    project_code: null,
    project_name: null,
    cost_center_id: null,
  },
  cost_centers: [],
  cashboxes: [
    {
      id: 'box-a',
      name: 'Main cashbox',
      location: 'Erbil',
      custodian_name: 'Hana',
      currency_code: 'IQD',
      current_balance: 900000,
      problem: null,
    },
  ],
}

let current = advance()
async function openPage(over: Record<string, unknown> = {}) {
  current = advance(over)
  apiGet.mockImplementation((url: string) => {
    if (url === '/finance/advances/adv-1') return Promise.resolve({ data: current })
    if (url === '/projects') return Promise.resolve({ data: { data: [] } })
    if (url === '/finance/advances/adv-1/issue-options')
      return Promise.resolve({ data: issueOptions })
    return Promise.resolve({ data: [] })
  })
  const { default: EmployeeAdvanceDetail } = await import('../EmployeeAdvanceDetail')
  render(
    <MemoryRouter initialEntries={['/finance/advances/adv-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/finance/advances/:id" element={<EmployeeAdvanceDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  await screen.findAllByText('ADV-0007')
}

const button = (name: string | RegExp) => screen.queryByRole('button', { name })
// a button that has to be there: fails with its name instead of a null
function must(name: string | RegExp): HTMLElement {
  const el = button(name)
  if (!el) throw new Error(`no button named ${String(name)}`)
  return el
}
const toasts = () => useToastStore.getState().toasts.map((t) => `${t.variant}: ${t.message}`)
const advanceLoads = () =>
  apiGet.mock.calls.filter((c: unknown[]) => c[0] === '/finance/advances/adv-1').length

beforeEach(() => {
  apiGet.mockReset()
  apiPost.mockReset().mockResolvedValue({ data: {} })
  perms = {}
  useToastStore.setState({ toasts: [] })
})

describe("EmployeeAdvanceDetail: the manager's approval", () => {
  it('offers Approve and Reject, and Approve no longer says it issues', async () => {
    perms = { 'finance.advances.approve': true }
    await openPage()
    expect(button('Approve')).toBeInTheDocument()
    expect(button('Reject')).toBeInTheDocument()
    expect(button(/approve & issue/i)).not.toBeInTheDocument()
    expect(button('Issue cash')).not.toBeInTheDocument()
  })

  it('the dialog says what approving does, and confirming posts approve (and nothing else)', async () => {
    perms = { 'finance.advances.approve': true }
    await openPage()
    fireEvent.click(must('Approve'))
    expect(await screen.findByText('Approve Advance')).toBeInTheDocument()
    expect(screen.getByText(/pays it out of a cashbox/i)).toBeInTheDocument()
    const loadsBefore = advanceLoads()
    const confirms = screen.getAllByRole('button', { name: 'Approve' })
    fireEvent.click(confirms[confirms.length - 1])
    await waitFor(() => {
      // a plain confirmation: nothing about a cost center goes with it
      expect(apiPost).toHaveBeenCalledWith('/finance/advances/adv-1/approve', {})
    })
    expect(apiPost).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(advanceLoads()).toBeGreaterThan(loadsBefore)
    })
  })

  it('the approve dialog does not ask the manager for a cost center (they do not know it; it is chosen when paying out)', async () => {
    perms = { 'finance.advances.approve': true }
    await openPage({ cost_center_id: null })
    fireEvent.click(must('Approve'))
    await screen.findByText('Approve Advance')
    expect(screen.queryByText(/cost center/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/classify this advance/i)).not.toBeInTheDocument()
    expect(document.querySelector('select')).toBeNull()
  })

  it('without the approve permission there is no Approve or Reject', async () => {
    perms = { 'finance.advances.view': true }
    await openPage()
    expect(button('Approve')).not.toBeInTheDocument()
    expect(button('Reject')).not.toBeInTheDocument()
  })

  it("a refused approval shows the server's reason instead of doing nothing", async () => {
    perms = { 'finance.advances.approve': true }
    apiPost.mockRejectedValue({
      response: { data: { error: { message: 'Advance is not pending approval' } } },
    })
    await openPage()
    fireEvent.click(must('Approve'))
    await screen.findByText('Approve Advance')
    const confirms = screen.getAllByRole('button', { name: 'Approve' })
    fireEvent.click(confirms[confirms.length - 1])
    await waitFor(() => {
      expect(toasts()).toContain('danger: Advance is not pending approval')
    })
  })

  it('a refusal with no message still says something', async () => {
    perms = { 'finance.advances.approve': true }
    apiPost.mockRejectedValue(new Error('Network Error'))
    await openPage()
    fireEvent.click(must('Approve'))
    await screen.findByText('Approve Advance')
    const confirms = screen.getAllByRole('button', { name: 'Approve' })
    fireEvent.click(confirms[confirms.length - 1])
    await waitFor(() => {
      expect(toasts()).toContain('danger: The action could not be completed')
    })
  })
})

describe('EmployeeAdvanceDetail: paying it out', () => {
  it('shows Issue cash to the cashbox handler on an approved advance, and not on others', async () => {
    perms = { 'finance.petty_cash.edit': true }
    await openPage({ status: 'pending_issue' })
    expect(button('Issue cash')).toBeInTheDocument()
  })

  it.each(['pending_approval', 'approved', 'rejected', 'settled', 'cancelled'])(
    'no Issue cash on a %s advance',
    async (status) => {
      perms = { 'finance.petty_cash.edit': true }
      await openPage({ status })
      expect(button('Issue cash')).not.toBeInTheDocument()
    },
  )

  it('a manager who cannot touch the cashbox cannot issue', async () => {
    perms = { 'finance.advances.approve': true, 'finance.advances.edit': true }
    await openPage({ status: 'pending_issue' })
    expect(button('Issue cash')).not.toBeInTheDocument()
    // and has nothing left to approve: the step moved on
    expect(button('Approve')).not.toBeInTheDocument()
    expect(button('Reject')).not.toBeInTheDocument()
  })

  it('Issue cash opens the cashbox dialog; choosing one and confirming issues it and reloads the page', async () => {
    perms = { 'finance.petty_cash.edit': true }
    await openPage({ status: 'pending_issue' })
    // nothing is fetched for the dialog until it is opened
    expect(apiGet).not.toHaveBeenCalledWith('/finance/advances/adv-1/issue-options')
    fireEvent.click(must('Issue cash'))
    fireEvent.click(await screen.findByRole('radio', { name: /main cashbox/i }))
    const loadsBefore = advanceLoads()
    current = advance({
      status: 'approved',
      issued_at: '2026-03-02T00:00:00Z',
      cashbox_name: 'Main cashbox',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Issue 200,000 IQD' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/finance/advances/adv-1/issue', {
        petty_cash_float_id: 'box-a',
      })
    })
    await waitFor(() => {
      expect(advanceLoads()).toBeGreaterThan(loadsBefore)
    })
    await waitFor(() => {
      expect(screen.queryByRole('radio', { name: /main cashbox/i })).not.toBeInTheDocument()
    })
    // the page now shows it as issued, from which cashbox
    expect(await screen.findByText('Main cashbox')).toBeInTheDocument()
    expect(button('Issue cash')).not.toBeInTheDocument()
  })
})

describe('EmployeeAdvanceDetail: statuses and what an issued advance shows', () => {
  it('names the statuses in the badge and the stepper: Awaiting Cash Issue and Issued, not "approved" for both', async () => {
    await openPage({ status: 'pending_issue' })
    // the badge and the step both read it
    expect(screen.getAllByText('Awaiting Cash Issue').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Issued')).toBeInTheDocument() // the next step
    expect(screen.getAllByText('Settled').length).toBeGreaterThan(0) // the last step (and the settled-amount row)
  })

  it('an issued advance shows the cashbox it came from and the date it was paid out', async () => {
    await openPage({
      status: 'approved',
      issued_at: '2026-03-02T00:00:00Z',
      cashbox_name: 'Main cashbox',
      approved_at: '2026-03-01T00:00:00Z',
    })
    expect(screen.getByText('Cashbox')).toBeInTheDocument()
    expect(screen.getByText('Main cashbox')).toBeInTheDocument()
    expect(screen.getByText('Issued on')).toBeInTheDocument()
  })

  it('shows the cost center the cashbox handler chose, and no row when none was chosen', async () => {
    await openPage({
      status: 'approved',
      issued_at: '2026-03-02T00:00:00Z',
      cashbox_name: 'Main cashbox',
      cost_center_code: 'OPS',
      cost_center_name: 'Operations',
    })
    expect(screen.getByText('OPS · Operations')).toBeInTheDocument()
  })

  it('an issued advance with no cost center shows no cost center row', async () => {
    await openPage({
      status: 'approved',
      issued_at: '2026-03-02T00:00:00Z',
      cashbox_name: 'Main cashbox',
    })
    expect(screen.queryByText('Cost Center')).not.toBeInTheDocument()
  })

  it('an advance not yet paid out shows no cashbox row', async () => {
    await openPage({ status: 'pending_issue', approved_at: '2026-03-01T00:00:00Z' })
    expect(screen.queryByText('Cashbox')).not.toBeInTheDocument()
  })
})

describe('EmployeeAdvanceDetail: cancelling', () => {
  it('an approved advance that has not been paid out can be cancelled', async () => {
    perms = { 'finance.advances.approve': true, 'finance.advances.edit': true }
    await openPage({ status: 'pending_issue' })
    expect(button('Void Advance')).toBeInTheDocument()
  })

  it('an issued advance with nothing settled can still be voided; one with settlements cannot', async () => {
    perms = { 'finance.advances.approve': true, 'finance.advances.edit': true }
    await openPage({ status: 'approved', issued_at: '2026-03-02T00:00:00Z' })
    expect(button('Void Advance')).toBeInTheDocument()
  })

  it('no Void once something has been settled against it', async () => {
    perms = { 'finance.advances.approve': true, 'finance.advances.edit': true }
    await openPage({ status: 'approved', settled_amount: 5000, outstanding_amount: 195000 })
    expect(button('Void Advance')).not.toBeInTheDocument()
  })

  it('no Void on a pending request that has not been approved yet', async () => {
    perms = { 'finance.advances.approve': true, 'finance.advances.edit': true }
    await openPage({ status: 'pending_approval' })
    expect(button('Void Advance')).not.toBeInTheDocument()
  })
})

describe('EmployeeAdvanceDetail: a rejected request', () => {
  it('shows Edit & resubmit to whoever may revise it (can_revise), and the dialog carries the reason', async () => {
    await openPage({ status: 'rejected', rejection_reason: 'Amount is too high', can_revise: true })
    fireEvent.click(must('Edit & resubmit'))
    // the page's own reason box and the dialog both show it
    await waitFor(() => {
      expect(screen.getAllByText('Amount is too high').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('no Edit & resubmit for someone who may not revise it', async () => {
    await openPage({
      status: 'rejected',
      rejection_reason: 'Amount is too high',
      can_revise: false,
    })
    expect(button('Edit & resubmit')).not.toBeInTheDocument()
  })

  it('no Edit & resubmit on an advance that is not rejected', async () => {
    await openPage({ status: 'pending_approval', can_revise: true })
    expect(button('Edit & resubmit')).not.toBeInTheDocument()
  })
})
