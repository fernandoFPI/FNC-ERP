// Advance requests in the Requisitions list. They live in employee_advances (finance REST), are merged into the list the way
// expense claims are, and follow the same road: the employee asks, a manager approves, a rejected one is corrected and sent
// again by whoever filed it. After the approval the cashbox handler pays it out of a cashbox of their choice
// (status pending_issue). What each person sees and where a click takes them depends on what they hold:
//   plain user         finance.* nothing   own requests only; a click opens a popup (Edit & resubmit when rejected)
//   cashbox handler    finance.petty_cash.edit   own + every advance waiting to be issued; a waiting one opens the issue dialog
//   finance viewer     finance.advances.view      every advance; a click opens the full advance page
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

// one stable result for every query on the page; `projects` is for the editor a rejected request opens
const stable = {
  data: { requisitions: [], myRequisitionApprovalQueue: [], projects: { data: [] } },
  loading: false,
  refetch: vi.fn(),
}
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: () => stable,
    useSubscription: () => ({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

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

const t = (key: string) => i18n.t(key)

const adv = (over: Record<string, unknown> = {}) => ({
  id: 'adv-1',
  advance_number: 'ADV-0001',
  employee_id: 'emp-1',
  employee_name: 'Nadia Saleh',
  purpose: 'Site fuel',
  project_id: null,
  project_code: null,
  project_name: null,
  amount: 200000,
  currency_code: 'IQD',
  status: 'pending_approval',
  rejection_reason: null,
  can_revise: false,
  created_at: '2026-03-01T10:00:00.000Z',
  updated_at: null,
  ...over,
})

let state: { mine: unknown[]; all: unknown[]; awaiting: unknown[] } = {
  mine: [],
  all: [],
  awaiting: [],
}
const urlsCalled = () => apiGet.mock.calls.map((c: unknown[]) => c[0] as string)

const issueOptions = {
  advance: {
    id: 'adv-2',
    advance_number: 'ADV-0002',
    employee_name: 'Omar',
    purpose: null,
    amount: 5000,
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
      location: null,
      custodian_name: null,
      currency_code: 'IQD',
      current_balance: 900000,
      problem: null,
    },
  ],
}

async function mount() {
  const RequisitionsPage = (await import('../RequisitionsPage')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions']}>
      <ThemeProvider>
        <RequisitionsPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  perms = {}
  state = { mine: [], all: [], awaiting: [] }
  apiGet.mockImplementation((url: string) => {
    if (url === '/finance/advances/mine') return Promise.resolve({ data: state.mine })
    if (url === '/finance/advances') return Promise.resolve({ data: state.all })
    if (url === '/finance/advances/awaiting-issue') return Promise.resolve({ data: state.awaiting })
    if (url.endsWith('/issue-options')) return Promise.resolve({ data: issueOptions })
    return Promise.resolve({ data: [] }) // expense claims, settlements
  })
  apiPost.mockResolvedValue({ data: {} })
})

describe('Requisitions list: advance rows', () => {
  it("shows a person's own advance requests as rows, each with its own status name", async () => {
    state.mine = [
      adv({
        id: 'a1',
        advance_number: 'ADV-0001',
        status: 'pending_approval',
        created_at: '2026-03-05T10:00:00Z',
      }),
      adv({
        id: 'a2',
        advance_number: 'ADV-0002',
        status: 'pending_issue',
        created_at: '2026-03-04T10:00:00Z',
      }),
      adv({
        id: 'a3',
        advance_number: 'ADV-0003',
        status: 'approved',
        created_at: '2026-03-03T10:00:00Z',
      }),
      adv({
        id: 'a4',
        advance_number: 'ADV-0004',
        status: 'rejected',
        created_at: '2026-03-02T10:00:00Z',
      }),
    ]
    await mount()
    for (const n of ['ADV-0001', 'ADV-0002', 'ADV-0003', 'ADV-0004'])
      expect(await screen.findByText(n)).toBeInTheDocument()
    // "approved" reads Issued here: it means paid out; the manager's approval is the step before it
    expect(screen.getAllByText('Awaiting Cash Issue').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Issued').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pending Approval').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    // the purpose shown under the number is Advance (the enum label of 'advance')
    expect(screen.getAllByText('advance').length).toBe(4)
  })

  it('lists them newest first among the other rows', async () => {
    state.mine = [
      adv({ id: 'a1', advance_number: 'ADV-OLD', created_at: '2026-01-01T00:00:00Z' }),
      adv({ id: 'a2', advance_number: 'ADV-NEW', created_at: '2026-04-01T00:00:00Z' }),
    ]
    await mount()
    await screen.findByText('ADV-NEW')
    const order = screen.getAllByText(/^ADV-/).map((el) => el.textContent)
    expect(order).toEqual(['ADV-NEW', 'ADV-OLD'])
  })

  it('a plain user fetches only their own: no company-wide list, no cashbox worklist', async () => {
    state.mine = [adv()]
    await mount()
    await screen.findByText('ADV-0001')
    expect(urlsCalled()).toContain('/finance/advances/mine')
    expect(urlsCalled()).not.toContain('/finance/advances')
    expect(urlsCalled()).not.toContain('/finance/advances/awaiting-issue')
  })

  it('searching for a reason finds the request', async () => {
    state.mine = [
      adv({ id: 'a1', advance_number: 'ADV-0001', purpose: 'Generator diesel' }),
      adv({ id: 'a2', advance_number: 'ADV-0002', purpose: 'Taxi' }),
    ]
    await mount()
    await screen.findByText('ADV-0001')
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'diesel' } })
    expect(screen.getByText('ADV-0001')).toBeInTheDocument()
    expect(screen.queryByText('ADV-0002')).not.toBeInTheDocument()
  })

  it('the Purpose filter offers Advance and shows only advances', async () => {
    state.mine = [adv()]
    await mount()
    await screen.findByText('ADV-0001')
    const purpose = screen.getByLabelText(t('req.list.purpose'))
    expect([...purpose.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toContain(
      'advance',
    )
    fireEvent.change(purpose, { target: { value: 'expense' } })
    expect(screen.queryByText('ADV-0001')).not.toBeInTheDocument()
    fireEvent.change(purpose, { target: { value: 'advance' } })
    expect(screen.getByText('ADV-0001')).toBeInTheDocument()
  })

  it('the Need Action tile shows only advances waiting to be issued; the Pending Approval tile only those waiting for the manager', async () => {
    state.mine = [
      adv({ id: 'a1', advance_number: 'ADV-WAIT-MGR', status: 'pending_approval' }),
      adv({ id: 'a2', advance_number: 'ADV-WAIT-CASH', status: 'pending_issue' }),
      adv({ id: 'a3', advance_number: 'ADV-ISSUED', status: 'approved' }),
      adv({ id: 'a4', advance_number: 'ADV-DONE', status: 'settled' }),
    ]
    await mount()
    await screen.findByText('ADV-WAIT-MGR')
    fireEvent.click(screen.getByText(t('req.list.needAction')))
    expect(screen.getByText('ADV-WAIT-CASH')).toBeInTheDocument()
    expect(screen.queryByText('ADV-WAIT-MGR')).not.toBeInTheDocument()
    expect(screen.queryByText('ADV-ISSUED')).not.toBeInTheDocument()
    // toggle off, then the other tile (its label also reads as a status badge, the tile comes first in the page)
    fireEvent.click(screen.getByText(t('req.list.needAction')))
    fireEvent.click(screen.getAllByText(t('req.list.pendingApproval'))[0])
    expect(screen.getByText('ADV-WAIT-MGR')).toBeInTheDocument()
    expect(screen.queryByText('ADV-WAIT-CASH')).not.toBeInTheDocument()
  })
})

describe('Requisitions list: counts', () => {
  it('the Open Requisitions tile counts advances still in progress and not the finished or stopped ones', async () => {
    state.mine = [
      adv({ id: 'a1', advance_number: 'ADV-1', status: 'pending_approval' }),
      adv({ id: 'a2', advance_number: 'ADV-2', status: 'pending_issue' }),
      adv({ id: 'a3', advance_number: 'ADV-3', status: 'approved' }),
      adv({ id: 'a4', advance_number: 'ADV-4', status: 'partially_settled' }),
      adv({ id: 'a5', advance_number: 'ADV-5', status: 'settled' }),
      adv({ id: 'a6', advance_number: 'ADV-6', status: 'rejected' }),
      adv({ id: 'a7', advance_number: 'ADV-7', status: 'cancelled' }),
    ]
    await mount()
    await screen.findByText('ADV-1')
    const tile = screen.getByText(t('req.list.openRequisitions')).parentElement
    expect(tile?.textContent).toMatch(/Open Requisitions4/)
  })
})

describe('Requisitions list: who sees what, and where a click goes', () => {
  it('finance (advances.view) sees every advance and a click opens the full advance page', async () => {
    perms = { 'finance.advances.view': true }
    state.mine = []
    state.all = [
      adv({ id: 'a1', advance_number: 'ADV-0001', employee_name: 'Someone Else' }),
      adv({ id: 'a2', advance_number: 'ADV-0002', status: 'pending_issue' }),
    ]
    await mount()
    expect(await screen.findByText('ADV-0001')).toBeInTheDocument()
    expect(screen.getByText('ADV-0002')).toBeInTheDocument()
    expect(urlsCalled()).toContain('/finance/advances')
    fireEvent.click(screen.getByText('ADV-0002'))
    expect(mockNavigate).toHaveBeenCalledWith('/finance/advances/a2')
  })

  it('a cashbox handler without advance access also sees what is waiting to be issued, without duplicating their own', async () => {
    perms = { 'finance.petty_cash.edit': true }
    state.mine = [adv({ id: 'a2', advance_number: 'ADV-0002', status: 'pending_issue' })] // their own request, also in the worklist
    state.awaiting = [
      adv({ id: 'a2', advance_number: 'ADV-0002', status: 'pending_issue' }),
      adv({ id: 'a5', advance_number: 'ADV-0005', status: 'pending_issue', employee_name: 'Omar' }),
    ]
    await mount()
    expect(await screen.findByText('ADV-0005')).toBeInTheDocument()
    expect(screen.getAllByText('ADV-0002')).toHaveLength(1)
    expect(urlsCalled()).toContain('/finance/advances/awaiting-issue')
    expect(urlsCalled()).not.toContain('/finance/advances') // no company-wide list without the permission
  })

  it('a click on an advance waiting to be issued opens the issue dialog for a cashbox handler', async () => {
    perms = { 'finance.petty_cash.edit': true }
    state.awaiting = [
      adv({
        id: 'adv-2',
        advance_number: 'ADV-0002',
        status: 'pending_issue',
        employee_name: 'Omar',
      }),
    ]
    await mount()
    fireEvent.click(await screen.findByText('ADV-0002'))
    await waitFor(() => {
      expect(urlsCalled()).toContain('/finance/advances/adv-2/issue-options')
    })
    expect(await screen.findByRole('radio', { name: /main cashbox/i })).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('issuing from the dialog closes it and reloads the list', async () => {
    perms = { 'finance.petty_cash.edit': true }
    state.awaiting = [
      adv({
        id: 'adv-2',
        advance_number: 'ADV-0002',
        status: 'pending_issue',
        employee_name: 'Omar',
      }),
    ]
    await mount()
    fireEvent.click(await screen.findByText('ADV-0002'))
    fireEvent.click(await screen.findByRole('radio', { name: /main cashbox/i }))
    const loadsBefore = urlsCalled().filter((u) => u === '/finance/advances/awaiting-issue').length
    state.awaiting = [] // it has been paid out
    fireEvent.click(screen.getByRole('button', { name: /^issue 5,000 iqd$/i }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/finance/advances/adv-2/issue', {
        petty_cash_float_id: 'box-a',
      })
    })
    await waitFor(() => {
      expect(
        urlsCalled().filter((u) => u === '/finance/advances/awaiting-issue').length,
      ).toBeGreaterThan(loadsBefore)
    })
    await waitFor(() => {
      expect(screen.queryByRole('radio', { name: /main cashbox/i })).not.toBeInTheDocument()
    })
  })

  it('a cashbox handler who clicks their own request that is not waiting gets the plain popup, not the issue dialog', async () => {
    perms = { 'finance.petty_cash.edit': true }
    state.mine = [adv({ id: 'a3', advance_number: 'ADV-0003', status: 'approved' })]
    await mount()
    fireEvent.click(await screen.findByText('ADV-0003'))
    expect(await screen.findByText(/paid out\. you can settle it/i)).toBeInTheDocument()
    expect(urlsCalled().some((u) => u.endsWith('/issue-options'))).toBe(false)
  })

  it('a plain user opens their rejected request in the popup, with the reason and Edit & resubmit', async () => {
    state.mine = [
      adv({
        id: 'a4',
        advance_number: 'ADV-0004',
        status: 'rejected',
        rejection_reason: 'Amount is too high',
        can_revise: true,
      }),
    ]
    await mount()
    fireEvent.click(await screen.findByText('ADV-0004'))
    expect(await screen.findByText('Amount is too high')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit & resubmit' })).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('resending a rejected request from the popup closes it and reloads their requests', async () => {
    state.mine = [
      adv({
        id: 'a4',
        advance_number: 'ADV-0004',
        status: 'rejected',
        purpose: 'Site fuel',
        rejection_reason: 'Too high',
        can_revise: true,
      }),
    ]
    await mount()
    fireEvent.click(await screen.findByText('ADV-0004'))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit & resubmit' }))
    fireEvent.change(screen.getByDisplayValue('200000'), { target: { value: '120000' } })
    const loadsBefore = urlsCalled().filter((u) => u === '/finance/advances/mine').length
    state.mine = [
      adv({ id: 'a4', advance_number: 'ADV-0004', status: 'pending_approval', amount: 120000 }),
    ]
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/finance/advances/a4/revise',
        expect.objectContaining({ amount: 120000 }),
      )
    })
    await waitFor(() => {
      expect(urlsCalled().filter((u) => u === '/finance/advances/mine').length).toBeGreaterThan(
        loadsBefore,
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument()
    })
  })

  it('the refresh button reloads the advances too', async () => {
    state.mine = [adv()]
    await mount()
    await screen.findByText('ADV-0001')
    const before = urlsCalled().filter((u) => u === '/finance/advances/mine').length
    fireEvent.click(screen.getByTitle(t('req.list.refresh')))
    await waitFor(() => {
      expect(urlsCalled().filter((u) => u === '/finance/advances/mine').length).toBeGreaterThan(
        before,
      )
    })
  })

  it('"only requisitions I organized" keeps the advances to the person\'s own', async () => {
    perms = { 'finance.advances.view': true }
    state.mine = [adv({ id: 'a1', advance_number: 'ADV-MINE' })]
    state.all = [
      adv({ id: 'a1', advance_number: 'ADV-MINE' }),
      adv({ id: 'a2', advance_number: 'ADV-OTHER', employee_name: 'Someone Else' }),
    ]
    await mount()
    expect(await screen.findByText('ADV-OTHER')).toBeInTheDocument()
    // open the More filters panel and tick the box
    fireEvent.click(screen.getByRole('button', { name: /more|filters/i }))
    fireEvent.click(screen.getByLabelText(t('req.list.onlyRequisitionsIOrganized')))
    expect(screen.queryByText('ADV-OTHER')).not.toBeInTheDocument()
    expect(screen.getByText('ADV-MINE')).toBeInTheDocument()
  })
})
