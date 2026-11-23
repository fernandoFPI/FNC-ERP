// My Queue remembers its filters when an item is opened and the person comes back (playbook #70 / #113). The item's own Back goes to the
// bare path, not one step back in history, so a filter kept only in component state (or only in the URL) was lost.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import type * as ApolloClientModule from '@apollo/client'

const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
  }
})
vi.mock('../../../../lib/axios', () => ({ api: { get: vi.fn().mockResolvedValue({ data: [] }) } }))
vi.mock('../../../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => false, canAny: () => false, isSystemLevel: false }),
}))
vi.mock('../../../../hooks/useEntityChanged', () => ({ useEntityChanged: vi.fn() }))

const KEY = 'my-queue-filters'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

const req = (id: string, number: string, status: string, ago: number) => ({
  id,
  requisition_number: number,
  status,
  priority: 'low',
  purpose: 'stock',
  project_id: null,
  projectCode: null,
  projectName: null,
  branch_id: 'b1',
  branch_name: 'Basra Office',
  organizer_id: 'u-other',
  organizerName: 'Jane Doe',
  created_at: daysAgo(ago + 1),
  updated_at: daysAgo(ago),
})
const po = (id: string, number: string, status: string, vendor: string, ago: number) => ({
  id,
  po_number: number,
  requisitionNumber: null,
  priority: 'low',
  projectCode: null,
  projectName: null,
  organizerName: 'Sam',
  status,
  currency_code: 'IQD',
  total_amount: '100',
  created_at: daysAgo(ago + 1),
  updated_at: daysAgo(ago),
  organizer_id: 'u-other',
  project_id: null,
  vendor_id: `v-${id}`,
  vendor_name: vendor,
  delivery_destination: null,
})

// REQ-A needs approval (a department head's pending_approval), REQ-B does not; PO-A needs approval, PO-B does not.
const requisitions = [
  req('r-a', 'REQ-A', 'pending_approval', 1),
  req('r-b', 'REQ-B', 'items_bought', 2),
]
const purchaseOrders = [
  po('p-a', 'PO-A', 'pending_approval', 'Acme Supplies', 3),
  po('p-b', 'PO-B', 'bought', 'Beta Trading', 4),
]

const queueData = {
  data: { myRequisitionApprovalQueue: requisitions, myPOQueue: purchaseOrders },
  loading: false,
  refetch: vi.fn(),
}

async function renderApp(path = '/procurement/queue') {
  const MyQueuePage = (await import('../MyQueuePage')).default
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <Routes>
          <Route path="/procurement/queue" element={<MyQueuePage />} />
          {/* the item's own Back: a fresh visit to the bare path, like PageHeader's backPath */}
          <Route
            path="/procurement/requisitions/:id"
            element={<Link to="/procurement/queue">Back to queue</Link>}
          />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

const shown = (n: string) => screen.queryByText(n) !== null
const openAndComeBack = () => {
  fireEvent.click(screen.getByText('REQ-A'))
  fireEvent.click(screen.getByText('Back to queue'))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mockUseQuery.mockReturnValue(queueData)
})

describe('My Queue keeps its filters when an item is opened and the person comes back', () => {
  it('keeps "Needs My Approval"', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: /needs my approval/i }))
    expect(shown('REQ-B')).toBe(false)
    openAndComeBack()
    expect(shown('REQ-A')).toBe(true)
    // a purchase order waiting for approval is not listed here: the tile is for requisitions only
    expect(shown('PO-A')).toBe(false)
    expect(shown('REQ-B')).toBe(false)
    expect(shown('PO-B')).toBe(false)
    expect(screen.getByRole('button', { name: /needs my approval/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('keeps the Requisitions tile', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: /^requisitions/i }))
    expect(shown('PO-A')).toBe(false)
    openAndComeBack()
    expect(shown('REQ-A')).toBe(true)
    expect(shown('PO-A')).toBe(false)
  })

  it('keeps the search text', async () => {
    await renderApp()
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'REQ-' } })
    expect(shown('PO-A')).toBe(false)
    openAndComeBack()
    expect(screen.getByPlaceholderText(/search/i)).toHaveValue('REQ-')
    expect(shown('REQ-A')).toBe(true)
    expect(shown('PO-A')).toBe(false)
  })

  it('keeps the Action choice', async () => {
    await renderApp()
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'Approve' } })
    expect(shown('REQ-B')).toBe(false)
    openAndComeBack()
    expect(screen.getByLabelText('Action')).toHaveValue('Approve')
    expect(shown('REQ-A')).toBe(true)
    expect(shown('REQ-B')).toBe(false)
  })

  it('does not keep a filter that was cleared', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: /needs my approval/i }))
    fireEvent.click(screen.getByRole('button', { name: /needs my approval/i })) // off again
    expect(shown('REQ-B')).toBe(true)
    openAndComeBack()
    expect(shown('REQ-B')).toBe(true)
    expect(shown('PO-B')).toBe(true)
  })

  it('an explicit ?filter=approval link wins over a remembered choice', async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ quick: 'overdue' }))
    await renderApp('/procurement/queue?filter=approval')
    expect(shown('REQ-A')).toBe(true)
    expect(shown('REQ-B')).toBe(false)
  })

  it('writes what the person chose under one key', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: /needs my approval/i }))
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'acme' } })
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    expect(saved).toMatchObject({ quick: 'approval', search: 'acme', kindFilter: '' })
  })
})

describe('what is read back from storage', () => {
  it('ignores an unknown tile and an unknown type', async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ quick: 'bogus', kindFilter: 'constructor' }))
    await renderApp()
    expect(shown('REQ-A') && shown('REQ-B') && shown('PO-A') && shown('PO-B')).toBe(true)
    // no filter is on, so the "My Queue" tile is the pressed one (an unknown value left as a filter would turn it off)
    expect(screen.getByRole('button', { name: /^my queue/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('writes the page the person is on, so Back returns to it', async () => {
    const many = Array.from({ length: 230 }, (_, i) =>
      req(`r-${i}`, `REQ-${String(i).padStart(3, '0')}`, 'pending_approval', i + 1),
    )
    mockUseQuery.mockReturnValue({
      ...queueData,
      data: { myRequisitionApprovalQueue: many, myPOQueue: [] },
    })
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getByText('Showing 201-230 of 230 entries')).toBeInTheDocument()
    expect((JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as { page?: number }).page).toBe(2)
  })

  it('ignores values of the wrong type', async () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ search: 5, kindFilter: {}, actionFilter: [], quick: 3, page: 'two' }),
    )
    await renderApp()
    expect(screen.getByPlaceholderText(/search/i)).toHaveValue('')
    expect(shown('REQ-A') && shown('PO-B')).toBe(true)
  })

  it('starts with no filters when the stored text is corrupt', async () => {
    sessionStorage.setItem(KEY, '{not json')
    await renderApp()
    expect(shown('REQ-A') && shown('PO-B')).toBe(true)
  })

  it('starts with no filters when storage is blocked', async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- kept to call the real one for every other key
    const real = Storage.prototype.getItem
    // only the page's own key is blocked: the theme and language read localStorage through the same prototype
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      k: string,
    ) {
      if (k === KEY) throw new Error('blocked')
      return real.call(this, k)
    })
    try {
      await renderApp()
      expect(shown('REQ-A') && shown('PO-B')).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('keeps a remembered page 2 on return, and a changed filter goes back to page 1', async () => {
    // 230 requisitions: the page holds 200, so page 2 is 201-230
    const many = Array.from({ length: 230 }, (_, i) =>
      req(`r-${i}`, `REQ-${String(i).padStart(3, '0')}`, 'pending_approval', i + 1),
    )
    mockUseQuery.mockReturnValue({
      ...queueData,
      data: { myRequisitionApprovalQueue: many, myPOQueue: [] },
    })
    sessionStorage.setItem(KEY, JSON.stringify({ page: 2 }))
    await renderApp()
    expect(screen.getByText('Showing 201-230 of 230 entries')).toBeInTheDocument()
    // a filter that still matches more than one page: the person is sent to page 1, not left on page 2
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'REQ-' } })
    expect(screen.getByText('Showing 1-200 of 230 entries')).toBeInTheDocument()
  })
})
