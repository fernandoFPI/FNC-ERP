// My Queue and the organizer review (migration 329, playbook #115): a requisition in organizer_review is the organizer's to review, one in
// review_approval is a PO Admin's to approve. The server decides who sees which (myRequisitionApprovalQueue); the page only has to word
// the row, name who it is for, open the requisition (not the Items Bought page), and count the approval under "Needs my approval".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
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

const req = (id: string, number: string, status: string) => ({
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
  organizer_id: 'u-organizer',
  organizerName: 'Olivia Organizer',
  created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  updated_at: new Date(Date.now() - 86_400_000).toISOString(),
})

const rows = [
  req('r-review', 'REQ-REVIEW', 'organizer_review'),
  req('r-approval', 'REQ-APPROVAL', 'review_approval'),
  req('r-pending', 'REQ-PENDING', 'pending_approval'),
  req('r-bought', 'REQ-BOUGHT', 'items_bought'),
]

async function open() {
  mockUseQuery.mockReturnValue({
    data: { myRequisitionApprovalQueue: rows, myPOQueue: [] },
    loading: false,
    refetch: vi.fn(),
  })
  const MyQueuePage = (await import('../MyQueuePage')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/queue']}>
      <ThemeProvider>
        <MyQueuePage />
        <Where />
      </ThemeProvider>
    </MemoryRouter>,
  )
}
// Shows where the router is, so a test can click a row and read where it went.
function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}
const rowOf = (number: string) => {
  const el = screen.getAllByText(number)[0]
  const r = el.closest('tr')
  if (!r) throw new Error(`no table row for ${number}`)
  return r
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})
afterEach(async () => {
  if (i18n.language !== 'en')
    await act(async () => {
      await i18n.changeLanguage('en')
    })
})

describe('My Queue and the organizer review', () => {
  it('words the organizer\'s row: "Review what was bought", for the Organizer, in the status "Organizer review"', async () => {
    await open()
    const r = within(rowOf('REQ-REVIEW'))
    expect(r.getByText('Organizer review')).toBeInTheDocument()
    expect(r.getByText('Review what was bought')).toBeInTheDocument()
    expect(r.getByText('Organizer')).toBeInTheDocument()
  })

  it('words the PO Admin\'s row: "Approve the changes", for the PO Admin, in the status "PO Admin approval"', async () => {
    await open()
    const r = within(rowOf('REQ-APPROVAL'))
    expect(r.getByText('PO Admin approval')).toBeInTheDocument()
    expect(r.getByText('Approve the changes')).toBeInTheDocument()
    expect(r.getByText('PO Admin')).toBeInTheDocument()
  })

  it('counts the PO Admin\'s approval under "Needs my approval", and not the organizer\'s own review', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: /needs my approval/i }))
    expect(screen.queryByText('REQ-APPROVAL')).not.toBeNull()
    expect(screen.queryByText('REQ-PENDING')).not.toBeNull()
    expect(screen.queryByText('REQ-REVIEW')).toBeNull()
    expect(screen.queryByText('REQ-BOUGHT')).toBeNull()
  })

  it('opens the requisition itself for both review statuses (not the Items Bought page), and Items Bought still opens its own page', async () => {
    await open()
    const where = () => screen.getByTestId('where').textContent
    for (const [number, path] of [
      ['REQ-REVIEW', '/procurement/requisitions/r-review'],
      ['REQ-APPROVAL', '/procurement/requisitions/r-approval'],
      ['REQ-BOUGHT', '/procurement/requisitions/r-bought/items-bought'],
    ] as const) {
      fireEvent.click(screen.getAllByText(number)[0])
      expect(where()).toBe(path)
    }
  })

  it('reads in Arabic with no raw key', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    await open()
    expect(document.body.textContent).not.toMatch(/queue\.act\.|queue\.role\.|req\.status\./)
    expect(screen.getAllByText('مراجعة المُنشئ').length).toBeGreaterThan(0)
    expect(screen.getAllByText('الموافقة على التغييرات').length).toBeGreaterThan(0)
  })
})
