import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'

// ── Apollo mock ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    gql: actual.gql,
  }
})

vi.mock('../../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'admin-1', role: 'system_admin' }, impersonatedBy: null }),
}))

vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ impersonate: vi.fn() }),
}))

// Marking a user whose purchases at Items Bought need the requisition organizer's approval (migration 316).
// Every other query the tab runs is answered with the least it needs to render.
function opName(doc: unknown): string | undefined {
  return (
    doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
  ).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
}

let reviewResult: { data?: { userPurchaseReview: boolean }; error?: Error } = {
  data: { userPurchaseReview: false },
}
const reviewCalls: Record<string, unknown>[] = []

// These results are built once and handed back by reference on every render. The tab re-runs effects keyed on
// the query data (companies, permissions), so a fresh object per render would loop forever.
const refetch = vi.fn()
const companiesResult = {
  data: { userCompanies: [{ id: 'co-1', name: 'Nishtimani Yakam' }] },
  loading: false,
  refetch,
}
const permissionsResult = {
  data: { userPermissions: { userId: 'u1', companyId: 'co-1', isAdmin: false, permissions: [] } },
  loading: false,
  refetch,
}
const templatesResult = { data: { roleTemplates: [] }, loading: false, refetch }
let positionsResult: {
  data: { userPOPositions: unknown[] }
  loading: boolean
  refetch: typeof refetch
} = {
  data: { userPOPositions: [] },
  loading: false,
  refetch,
}
const positionCalls: Record<string, unknown>[] = []

function mockQueries() {
  mockUseQuery.mockImplementation(
    (doc: unknown, opts?: { variables?: Record<string, unknown>; skip?: boolean }) => {
      const name = opName(doc)
      if (name === 'GetUserCompanies') return companiesResult
      if (name === 'GetUserPermissions') return permissionsResult
      if (name === 'GetRoleTemplates') return templatesResult
      if (name === 'GetUserPOPositions') {
        if (!opts?.skip) positionCalls.push(opts?.variables ?? {})
        return positionsResult
      }
      if (name === 'GetUserPurchaseReview') {
        if (!opts?.skip) reviewCalls.push(opts?.variables ?? {})
        return { ...reviewResult, loading: false, refetch: vi.fn() }
      }
      return { data: undefined, loading: false, refetch: vi.fn() }
    },
  )
}

const setReview = vi.fn().mockResolvedValue({})
interface AssignArg {
  variables: { input: Record<string, unknown> }
}
const assignPosition = vi.fn<[AssignArg], Promise<unknown>>().mockResolvedValue({})

beforeEach(() => {
  vi.clearAllMocks()
  reviewCalls.length = 0
  positionCalls.length = 0
  positionsResult = { data: { userPOPositions: [] }, loading: false, refetch }
  reviewResult = { data: { userPurchaseReview: false } }
  mockQueries()
  mockUseMutation.mockImplementation((doc: unknown) => {
    if (opName(doc) === 'SetUserPurchaseReview') return [setReview, { loading: false }]
    if (opName(doc) === 'AssignPOPosition') return [assignPosition, { loading: false }]
    return [vi.fn().mockResolvedValue({}), { loading: false }]
  })
})

afterEach(async () => {
  if (i18n.language !== 'en') {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  }
})

async function open() {
  const UserRolesTab = (await import('../tabs/UserRolesTab')).default
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <UserRolesTab userId="u1" />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('UserRolesTab: purchases that need the organizer’s approval', () => {
  it('shows the setting, off for a user who is not marked', async () => {
    await open()
    expect(screen.getByText('Purchase approval')).toBeInTheDocument()
    expect(
      screen.getByLabelText("This user's purchases need the organizer's approval"),
    ).not.toBeChecked()
  })

  it('shows it on for a marked user', async () => {
    reviewResult = { data: { userPurchaseReview: true } }
    await open()
    expect(
      screen.getByLabelText("This user's purchases need the organizer's approval"),
    ).toBeChecked()
  })

  it('reads and writes the mark of the company the screen is showing, not the admin’s session company', async () => {
    await open()
    expect(reviewCalls.at(-1)).toEqual({ userId: 'u1', companyId: 'co-1' })
    fireEvent.click(screen.getByLabelText("This user's purchases need the organizer's approval"))
    expect(setReview).toHaveBeenCalledWith({
      variables: { userId: 'u1', required: true, companyId: 'co-1' },
    })
  })

  it('un-marks a marked user', async () => {
    reviewResult = { data: { userPurchaseReview: true } }
    await open()
    fireEvent.click(screen.getByLabelText("This user's purchases need the organizer's approval"))
    expect(setReview).toHaveBeenCalledWith({
      variables: { userId: 'u1', required: false, companyId: 'co-1' },
    })
  })

  it('explains what it does, and that purchases already recorded are not affected', async () => {
    await open()
    expect(
      screen.getByText(
        /the requisition waits there until its organizer approves it or sends it back/i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/purchases already recorded are not affected/i)).toBeInTheDocument()
  })

  it('is not shown when the server refuses the question (an admin who may not manage this)', async () => {
    reviewResult = { error: new Error('system_admin role or PO Admin position required') }
    await open()
    expect(screen.queryByText('Purchase approval')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText("This user's purchases need the organizer's approval"),
    ).not.toBeInTheDocument()
  })

  it('reads in Arabic without raw keys', async () => {
    await i18n.changeLanguage('ar')
    await open()
    expect(screen.getByText('الموافقة على المشتريات')).toBeInTheDocument()
    expect(
      screen.getByLabelText('مشتريات هذا المستخدم تحتاج إلى موافقة مُنشئ الطلب'),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/admin\.userRoles\./)
  })
})

// The PO positions on this tab belong to the company the tab SHOWS (its company switcher), not to the admin's session
// company, and the Add Position modal names the user and the company; the server finds the employee record there.
describe('UserRolesTab: PO positions act on the company shown', () => {
  const position = (over: Record<string, unknown> = {}) => ({
    id: 'pp-1',
    employeeId: 'emp-in-some-company',
    employeeName: 'Zain',
    position: 'buyer',
    projectId: null,
    projectName: null,
    departmentId: 'd-1',
    departmentName: 'Kitchen',
    branchId: null,
    branchName: null,
    isActive: true,
    ...over,
  })

  function fillAndAssign() {
    fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))
    fireEvent.click(screen.getByText('Select position…'))
    fireEvent.mouseDown(screen.getByText('Store Keeper')) // the options choose on mouse-down
    fireEvent.change(screen.getByPlaceholderText('Enter project ID'), {
      target: { value: 'proj-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
  }
  const sentInput = () => {
    const call = assignPosition.mock.calls.at(-1)
    if (!call) throw new Error('assignPOPosition was not called')
    return call[0].variables.input
  }

  it('asks for the positions of the company the screen is showing', async () => {
    await open()
    expect(positionCalls.at(-1)).toEqual({ userId: 'u1', companyId: 'co-1' })
  })

  it('gives a user with no position yet their first one: it names the user and the company, no employee', async () => {
    await open()
    fillAndAssign()
    expect(assignPosition).toHaveBeenCalledTimes(1)
    expect(sentInput()).toEqual({
      userId: 'u1',
      companyId: 'co-1',
      position: 'store_keeper',
      projectId: 'proj-1',
    })
    expect(sentInput()).not.toHaveProperty('employeeId')
  })

  it('does not borrow the employee of the first position the user happens to have', async () => {
    positionsResult = { data: { userPOPositions: [position()] }, loading: false, refetch }
    await open()
    fillAndAssign()
    expect(sentInput()).toMatchObject({ userId: 'u1', companyId: 'co-1', position: 'store_keeper' })
    expect(sentInput()).not.toHaveProperty('employeeId')
  })
})
