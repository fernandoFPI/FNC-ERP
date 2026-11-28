// The Performance tab on the employee page is offered only when the server says the caller may open it (canViewEmployeePerformance). The page
// keeps no copy of that rule, so this test drives it from the server's answer alone.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type { DocumentNode } from 'graphql'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import '../../../../i18n'
import EmployeeDetail from '../EmployeeDetail'

const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: () => [vi.fn().mockResolvedValue({}), { loading: false }],
    gql: actual.gql,
  }
})
vi.mock('../../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))
vi.mock('../EmployeePerformanceTab', () => ({
  EmployeePerformanceTab: ({ employeeId }: { employeeId: string }) => (
    <div data-testid="performance-tab">{`performance for ${employeeId}`}</div>
  ),
}))

const EMPLOYEE = {
  id: 'e1',
  employee_number: 'E-1',
  first_name: 'Example',
  last_name: 'Employee',
  email: null,
  phone: null,
  national_id: null,
  passport_number: null,
  nationality: null,
  date_of_birth: null,
  gender: null,
  job_title: 'Procurement Officer',
  department_id: null,
  department_name: null,
  work_location_id: null,
  manager_id: null,
  employment_type: 'full_time',
  hire_date: '2024-01-01',
  termination_date: null,
  status: 'active',
  is_active: true,
  user_id: null,
  linked_user_email: null,
  photo_url: null,
  advance_control_account_id: null,
  advance_control_account_code: null,
  advance_control_account_name: null,
}

let canView: boolean | undefined
const calls: { name: string; variables: unknown }[] = []
// every result is built once, so a query hook that hands back a fresh object each render cannot loop the page
const EMPLOYEE_RESULT = {
  data: { employee: EMPLOYEE },
  loading: false,
  error: undefined,
  refetch: vi.fn(),
}
const EMPTY_RESULT = { data: undefined, loading: false, error: undefined, refetch: vi.fn() }
const CAN_TRUE = {
  data: { canViewEmployeePerformance: true },
  loading: false,
  error: undefined,
  refetch: vi.fn(),
}
const CAN_FALSE = {
  data: { canViewEmployeePerformance: false },
  loading: false,
  error: undefined,
  refetch: vi.fn(),
}

function mount() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/hr/employees/e1']}>
        <Routes>
          <Route path="/hr/employees/:id" element={<EmployeeDetail />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
  canView = true
  mockUseQuery.mockReset()
  mockUseQuery.mockImplementation(
    (doc: DocumentNode, opts?: { variables?: unknown; skip?: boolean }) => {
      const def = doc.definitions[0]
      const name = (def as { name?: { value: string } } | undefined)?.name?.value ?? ''
      calls.push({ name, variables: opts?.variables })
      if (opts?.skip) return EMPTY_RESULT
      if (name === 'Employee') return EMPLOYEE_RESULT
      if (name === 'CanViewEmployeePerformance')
        return canView === undefined ? EMPTY_RESULT : canView ? CAN_TRUE : CAN_FALSE
      return EMPTY_RESULT
    },
  )
})
afterEach(cleanup)

describe('the Performance tab on the employee page', () => {
  it('asks the server whether this caller may open it, for this employee', () => {
    mount()
    const ask = calls.filter((c) => c.name === 'CanViewEmployeePerformance')
    expect(ask.length).toBeGreaterThan(0)
    expect(
      ask.every((c) => JSON.stringify(c.variables) === JSON.stringify({ employeeId: 'e1' })),
    ).toBe(true)
  })

  it('offers the tab when the server says yes, and shows the performance figures when it is chosen', () => {
    mount()
    expect(screen.queryByTestId('performance-tab')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Performance' }))
    expect(screen.getByTestId('performance-tab').textContent).toBe('performance for e1')
  })

  it('does not offer it when the server says no', () => {
    canView = false
    mount()
    expect(screen.queryByRole('button', { name: 'Performance' })).toBeNull()
    expect(screen.queryByText('Performance')).toBeNull()
    // the other tabs are all still there
    for (const name of ['Overview', 'Salary', 'Attendance', 'Leave', 'Documents', 'Activity'])
      expect(screen.getByRole('button', { name })).toBeTruthy()
  })

  it('does not offer it while the answer has not arrived', () => {
    canView = undefined
    mount()
    expect(screen.queryByRole('button', { name: 'Performance' })).toBeNull()
  })

  it('puts it after the other tabs', () => {
    mount()
    const all = [
      'Overview',
      'Salary',
      'Attendance',
      'Leave',
      'Documents',
      'Activity',
      'Performance',
    ]
    const names = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((n) => all.includes(n))
    expect(names).toEqual(all)
  })
})
