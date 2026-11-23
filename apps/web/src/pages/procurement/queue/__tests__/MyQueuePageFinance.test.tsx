// What My Queue shows from Finance: expense claims, advance REQUESTS (waiting for their manager, then for the cashbox handler) and advance
// settlements, and which of them count under "Needs My Approval". The older MyQueuePage tests mock every permission as false, so none of
// this was ever exercised (playbook #113).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

const h = vi.hoisted(() => ({
  get: vi.fn<[string, { params?: { status?: string } }?], Promise<unknown>>(),
  allowed: new Set<string>(),
  navigate: vi.fn(),
}))

// One result object for every render: a fresh one each time would make the page recompute its list on every render and hide a stale one.
const emptyQueue = vi.hoisted(() => ({
  data: { myRequisitionApprovalQueue: [], myPOQueue: [] },
  loading: false,
  refetch: () => Promise.resolve({}),
}))
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: () => emptyQueue,
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
  }
})
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => h.navigate }
})
vi.mock('../../../../lib/axios', () => ({ api: { get: h.get } }))
vi.mock('../../../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: (key: string) => h.allowed.has(key),
    canAny: () => false,
    isSystemLevel: false,
  }),
}))
vi.mock('../../../../hooks/useEntityChanged', () => ({ useEntityChanged: vi.fn() }))

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

const claim = (id: string, number: string, status: string) => ({
  id,
  claim_number: number,
  employee_name: `Emp ${number}`,
  status,
  created_at: daysAgo(2),
})
const advance = (id: string, number: string, status: string) => ({
  id,
  advance_number: number,
  employee_name: `Emp ${number}`,
  status,
  created_at: daysAgo(3),
  approved_at: daysAgo(1),
})
const settlement = (id: string, number: string) => ({
  id,
  settlement_number: number,
  employee_name: `Emp ${number}`,
  advance_id: 'adv-x',
  status: 'submitted',
  created_at: daysAgo(4),
})

// What the finance service would answer, by URL and status.
function finance() {
  h.get.mockImplementation((url: string, opts?: { params?: { status?: string } }) => {
    const s = opts?.params?.status
    if (url === '/finance/expense-claims')
      return Promise.resolve({
        data:
          s === 'submitted'
            ? [claim('c1', 'EXP-SUBMITTED', 'submitted')]
            : s === 'approved'
              ? [claim('c2', 'EXP-FUNDING', 'approved')]
              : [],
      })
    if (url === '/finance/advances')
      return Promise.resolve({
        data: s === 'pending_approval' ? [advance('a1', 'ADV-PENDING', 'pending_approval')] : [],
      })
    if (url === '/finance/advances/awaiting-issue')
      return Promise.resolve({ data: [advance('a2', 'ADV-CASH', 'pending_issue')] })
    if (url === '/finance/advances/settlements')
      return Promise.resolve({ data: [settlement('s1', 'SET-1')] })
    return Promise.resolve({ data: [] })
  })
}

async function renderPage(path = '/procurement/queue') {
  const MyQueuePage = (await import('../MyQueuePage')).default
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <MyQueuePage />
      </ThemeProvider>
    </MemoryRouter>,
  )
  await act(() => Promise.resolve())
  return utils
}
const shown = (n: string) => screen.queryByText(n) !== null
const callsTo = (url: string) => h.get.mock.calls.filter((c) => c[0] === url)

const ALL = ['finance.expenses.approve', 'finance.advances.approve', 'finance.petty_cash.edit']

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  h.allowed = new Set(ALL)
  finance()
})
afterEach(async () => {
  if (i18n.language !== 'en')
    await act(async () => {
      await i18n.changeLanguage('en')
    })
})

describe('what Finance puts in the queue', () => {
  it('lists an expense claim waiting for approval', async () => {
    await renderPage()
    expect(shown('EXP-SUBMITTED')).toBe(true)
    expect(screen.getAllByText('Approve expense claim').length).toBeGreaterThan(0)
  })

  it('lists an expense claim waiting for the funding decision', async () => {
    await renderPage()
    expect(shown('EXP-FUNDING')).toBe(true)
    expect(screen.getAllByText('Decide expense funding source').length).toBeGreaterThan(0)
  })

  it('lists an advance request waiting for its manager', async () => {
    await renderPage()
    expect(shown('ADV-PENDING')).toBe(true)
    expect(screen.getAllByText('Approve advance request').length).toBeGreaterThan(0)
  })

  it('lists an approved advance request waiting for the cashbox handler', async () => {
    await renderPage()
    expect(shown('ADV-CASH')).toBe(true)
    expect(screen.getAllByText('Issue advance cash').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Awaiting cash issue').length).toBeGreaterThan(0)
  })

  it('adds advance requests that arrive after everything else', async () => {
    let release: (v: { data: unknown[] }) => void = () => undefined
    const late = new Promise<{ data: unknown[] }>((resolve) => {
      release = resolve
    })
    const base = h.get.getMockImplementation()
    if (!base) throw new Error('the finance mock is not set')
    h.get.mockImplementation((url: string, opts?: { params?: { status?: string } }) =>
      url === '/finance/advances' ? late : base(url, opts),
    )
    await renderPage()
    expect(shown('ADV-PENDING')).toBe(false)
    expect(shown('EXP-SUBMITTED')).toBe(true)
    await act(async () => {
      release({ data: [advance('a1', 'ADV-PENDING', 'pending_approval')] })
      await late
    })
    expect(shown('ADV-PENDING')).toBe(true)
  })

  it('still lists an advance settlement', async () => {
    await renderPage()
    expect(shown('SET-1')).toBe(true)
  })

  it('asks the finance service for exactly the statuses it shows', async () => {
    await renderPage()
    const statusesAsked = (url: string) => callsTo(url).map((c) => c[1]?.params?.status)
    expect(statusesAsked('/finance/advances')).toEqual(['pending_approval'])
    expect(statusesAsked('/finance/expense-claims').sort()).toEqual(['approved', 'submitted'])
    expect(callsTo('/finance/advances/awaiting-issue')).toHaveLength(1)
  })
})

describe('"Needs My Approval"', () => {
  it('counts requisitions only: no expense claim, advance, settlement or cash issue is in the tile', async () => {
    await renderPage()
    const tile = screen.getByRole('button', { name: /needs my approval/i })
    expect(tile).toHaveTextContent('0')
  })

  it('shows none of them when the tile is pressed', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /needs my approval/i }))
    for (const n of ['EXP-SUBMITTED', 'EXP-FUNDING', 'ADV-PENDING', 'ADV-CASH', 'SET-1'])
      expect(shown(n)).toBe(false)
  })

  it('still lists every one of them when nothing is filtered', async () => {
    await renderPage()
    for (const n of ['EXP-SUBMITTED', 'EXP-FUNDING', 'ADV-PENDING', 'ADV-CASH', 'SET-1'])
      expect(shown(n)).toBe(true)
  })

  it('shows none of them for the old Approval Queue link either', async () => {
    await renderPage('/procurement/queue?filter=approval')
    for (const n of ['EXP-SUBMITTED', 'EXP-FUNDING', 'ADV-PENDING', 'ADV-CASH', 'SET-1'])
      expect(shown(n)).toBe(false)
  })
})

describe('who is asked', () => {
  it('a person with no finance permission is shown nothing from Finance and the service is not asked', async () => {
    h.allowed = new Set()
    await renderPage()
    for (const n of ['EXP-SUBMITTED', 'EXP-FUNDING', 'ADV-PENDING', 'ADV-CASH', 'SET-1'])
      expect(shown(n)).toBe(false)
    expect(h.get).not.toHaveBeenCalled()
  })

  it('an advance approver sees pending requests but not the cash-issue list', async () => {
    h.allowed = new Set(['finance.advances.approve'])
    await renderPage()
    expect(shown('ADV-PENDING')).toBe(true)
    expect(shown('ADV-CASH')).toBe(false)
    expect(callsTo('/finance/advances/awaiting-issue')).toHaveLength(0)
  })

  it('a cashbox handler sees what waits for cash and nothing else from Finance', async () => {
    h.allowed = new Set(['finance.petty_cash.edit'])
    await renderPage()
    expect(shown('ADV-CASH')).toBe(true)
    expect(shown('ADV-PENDING')).toBe(false)
    expect(shown('EXP-SUBMITTED')).toBe(false)
    expect(callsTo('/finance/advances')).toHaveLength(0)
  })

  it('an expense approver is not shown advance requests', async () => {
    h.allowed = new Set(['finance.expenses.approve'])
    await renderPage()
    expect(shown('EXP-SUBMITTED')).toBe(true)
    expect(shown('ADV-PENDING') || shown('ADV-CASH')).toBe(false)
  })
})

describe('the rows', () => {
  it('opens the advance on its own page', async () => {
    await renderPage()
    fireEvent.click(screen.getByText('ADV-PENDING'))
    expect(h.navigate).toHaveBeenCalledWith('/finance/advances/a1')
    fireEvent.click(screen.getByText('ADV-CASH'))
    expect(h.navigate).toHaveBeenCalledWith('/finance/advances/a2')
  })

  it('offers "Advance request" as a Type', async () => {
    await renderPage()
    const type = screen.getByLabelText('Type')
    fireEvent.change(type, { target: { value: 'advance' } })
    expect(shown('ADV-PENDING') && shown('ADV-CASH')).toBe(true)
    expect(shown('EXP-SUBMITTED') || shown('SET-1')).toBe(false)
  })

  it('tags an advance request ADV, apart from a settlement (SET)', async () => {
    await renderPage()
    expect(screen.getAllByText('ADV')).toHaveLength(2)
    expect(screen.getAllByText('SET')).toHaveLength(1)
  })

  it('a cash-issue row has been waiting since the manager approved it, not since it was filed', async () => {
    await renderPage()
    const row = screen.getByText('ADV-CASH').closest('tr')
    if (!row) throw new Error('no row')
    expect(row).toHaveTextContent('1 day')
  })

  it('says it in Arabic with no raw key on the page', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    await renderPage()
    await waitFor(() => {
      expect(shown('ADV-PENDING')).toBe(true)
    })
    expect(document.body.textContent).not.toMatch(/queue\.(act|kind|role|advanceRequest)/)
    expect(screen.getAllByText('الموافقة على طلب السلفة').length).toBeGreaterThan(0)
    expect(screen.getAllByText('صرف نقد السلفة').length).toBeGreaterThan(0)
  })
})
