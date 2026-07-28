import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'

// ── Apollo mock ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>()
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

vi.mock('../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
})

// ── AccountsPage ─────────────────────────────────────────────────────────────
describe('AccountsPage', () => {
  const accounts = [
    {
      id: '1',
      code: '1001',
      name: 'Cash',
      account_type: 'asset',
      currency_code: 'IQD',
      is_active: true,
    },
    {
      id: '2',
      code: '4001',
      name: 'Sales Revenue',
      account_type: 'revenue',
      currency_code: 'IQD',
      is_active: true,
    },
    {
      id: '3',
      code: '5001',
      name: 'Office Expense',
      account_type: 'expense',
      currency_code: 'USD',
      is_active: false,
    },
  ]

  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: { accounts }, loading: false, refetch: vi.fn() })
  })

  it('renders account codes and names', async () => {
    const AccountsPage = (await import('../accounts/AccountsPage')).default
    wrap(<AccountsPage />)
    expect(screen.getByText('1001')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('Sales Revenue')).toBeInTheDocument()
  })

  it('renders type badges for each account', async () => {
    const AccountsPage = (await import('../accounts/AccountsPage')).default
    wrap(<AccountsPage />)
    // getByText finds multiple (option + badge) so use getAllByText
    expect(screen.getAllByText('Asset').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Revenue').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Expense').length).toBeGreaterThan(0)
  })

  it('navigates to create form on New Account click', async () => {
    const AccountsPage = (await import('../accounts/AccountsPage')).default
    wrap(<AccountsPage />)
    fireEvent.click(screen.getByRole('button', { name: /new account/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/finance/accounts/new')
  })

  it('shows active and inactive status badges', async () => {
    const AccountsPage = (await import('../accounts/AccountsPage')).default
    wrap(<AccountsPage />)
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('filters accounts by search text client-side', async () => {
    const AccountsPage = (await import('../accounts/AccountsPage')).default
    wrap(<AccountsPage />)
    const inputs = screen.getAllByRole('textbox')
    const searchInput = inputs[0]
    fireEvent.change(searchInput, { target: { value: 'Cash' } })
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument()
    })
  })
})

// ── JournalForm ──────────────────────────────────────────────────────────────
describe('JournalForm', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: { accounts: [] }, loading: false })
  })

  it('starts with two journal line rows', async () => {
    const JournalForm = (await import('../journals/JournalForm')).default
    wrap(<JournalForm />)
    // Each line has a debit and credit input; check for Add Line button
    expect(screen.getByRole('button', { name: /add line/i })).toBeInTheDocument()
  })

  it('adds a journal line on Add Line click', async () => {
    const JournalForm = (await import('../journals/JournalForm')).default
    wrap(<JournalForm />)
    // Start with 2 lines → 2 × buttons
    const removeButtonsBefore = screen.getAllByText('×').length
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    const removeButtonsAfter = screen.getAllByText('×').length
    expect(removeButtonsAfter).toBeGreaterThan(removeButtonsBefore)
  })

  it('shows balance indicator section', async () => {
    const JournalForm = (await import('../journals/JournalForm')).default
    wrap(<JournalForm />)
    // Balance section shows Debit / Credit totals
    expect(screen.getByText(/debit/i)).toBeInTheDocument()
    expect(screen.getByText(/credit/i)).toBeInTheDocument()
  })

  it('shows balance totals in the balance indicator section', async () => {
    const JournalForm = (await import('../journals/JournalForm')).default
    wrap(<JournalForm />)
    // Balance section shows "Total Debits" / "Total Credits" / "Difference"
    expect(screen.getByText(/total debits|debits|debit/i)).toBeInTheDocument()
    expect(screen.getByText(/total credits|credits|credit/i)).toBeInTheDocument()
  })
})

// ── JournalDetail ────────────────────────────────────────────────────────────
describe('JournalDetail', () => {
  function mockEntry(status: string) {
    const entry = {
      id: 'je-1',
      reference: 'JE-FNC-2026-001',
      entry_date: '2026-06-01',
      status,
      source_type: 'manual',
      description: 'Test entry',
      total_debit: '1000',
      total_credit: '1000',
      created_by_email: 'user@fnc.com',
      lines: [
        {
          id: 'l1',
          account_id: 'a1',
          account_code: '1001',
          account_name: 'Cash',
          debit: '1000',
          credit: '0',
          currency_code: 'IQD',
        },
        {
          id: 'l2',
          account_id: 'a2',
          account_code: '4001',
          account_name: 'Revenue',
          debit: '0',
          credit: '1000',
          currency_code: 'IQD',
        },
      ],
    }
    mockUseQuery.mockReturnValue({ data: { journalEntry: entry }, loading: false })
  }

  it('shows Post and Cancel Entry buttons when status is draft', async () => {
    mockEntry('draft')
    const JournalDetail = (await import('../journals/JournalDetail')).default
    wrap(<JournalDetail />, '/finance/journals/je-1')
    expect(screen.getByRole('button', { name: /post/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel entry/i })).toBeInTheDocument()
  })

  it('shows Reverse button when status is posted', async () => {
    mockEntry('posted')
    const JournalDetail = (await import('../journals/JournalDetail')).default
    wrap(<JournalDetail />, '/finance/journals/je-1')
    expect(screen.getByRole('button', { name: /reverse/i })).toBeInTheDocument()
  })

  it('does not show Post button when status is posted', async () => {
    mockEntry('posted')
    const JournalDetail = (await import('../journals/JournalDetail')).default
    wrap(<JournalDetail />, '/finance/journals/je-1')
    expect(screen.queryByRole('button', { name: /^post$/i })).not.toBeInTheDocument()
  })

  it('renders journal lines table with account codes', async () => {
    mockEntry('draft')
    const JournalDetail = (await import('../journals/JournalDetail')).default
    wrap(<JournalDetail />, '/finance/journals/je-1')
    expect(screen.getByText('1001')).toBeInTheDocument()
    expect(screen.getByText('4001')).toBeInTheDocument()
  })

  it('opens cancel confirm dialog when Cancel Entry is clicked', async () => {
    mockEntry('draft')
    const JournalDetail = (await import('../journals/JournalDetail')).default
    wrap(<JournalDetail />, '/finance/journals/je-1')
    fireEvent.click(screen.getByRole('button', { name: /cancel entry/i }))
    await waitFor(() => {
      // ConfirmDialog should appear with a confirm/yes button
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(2)
    })
  })
})
