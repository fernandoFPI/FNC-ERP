// The analytic account page of a project (playbook #92, NY-PRJ-2026-0032): it said "Total Lines 0" and "No journal lines yet"
// for a project with 175 cost entries, because the cost of a project is not journal-tagged. The page now carries the
// project's cost ledger above its journal lines, for an account that belongs to a project, and only then.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type * as ApolloClientModule from '@apollo/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import AnalyticAccountDetail from '../AnalyticAccountDetail'

const apiGet = vi.fn()
vi.mock('../../../../lib/axios', () => ({
  api: { get: (...a: unknown[]): unknown => apiGet(...a) },
}))

const useQueryMock = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return { ...actual, useQuery: (...a: unknown[]): unknown => useQueryMock(...a) }
})

const account = (over: Record<string, unknown> = {}) => ({
  id: 'aa-1',
  code: 'NY-PRJ-2026-0032',
  name: "Project: Mr.Rizgar's House",
  is_active: true,
  journal_line_count: 0,
  currency_totals: [],
  project_id: 'project-1',
  project_name: "Mr.Rizgar's House",
  project_status: 'approved',
  lines: [],
  ...over,
})

// built once: a mock that returns a fresh object each call would loop a component with an effect
const ledgerResult = {
  data: {
    projectCostLedger: {
      entries: [
        {
          id: 'c1',
          entryDate: '2026-11-10',
          sourceType: 'po_direct_delivery',
          costCategory: 'materials',
          amount: '850.5000',
          currencyCode: 'USD',
          reference: 'NY-PO-2026-0063 / line 4',
        },
      ],
      totals: [{ currencyCode: 'USD', amount: '850.5000' }],
      truncated: false,
    },
  },
  loading: false,
  error: undefined,
}

function open() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/finance/analytic-accounts/aa-1']}>
        <Routes>
          <Route path="/finance/analytic-accounts/:id" element={<AnalyticAccountDetail />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  apiGet.mockReset()
  useQueryMock.mockReset()
  useQueryMock.mockReturnValue(ledgerResult)
})

describe('the analytic account of a project', () => {
  it("shows the project's cost ledger even though no journal line is tagged", async () => {
    apiGet.mockResolvedValue({ data: account() })
    open()
    expect(await screen.findByText('Project cost ledger')).toBeInTheDocument()
    expect(screen.getByText('NY-PO-2026-0063 / line 4')).toBeInTheDocument()
    expect(screen.getByTestId('cost-ledger-totals')).toHaveTextContent('850.50 USD')
    // the journal lines card is still there, honestly empty
    expect(screen.getByText('No journal lines yet.')).toBeInTheDocument()
  })

  it('asks for the cost ledger of the project the account belongs to', async () => {
    apiGet.mockResolvedValue({ data: account({ project_id: 'project-42' }) })
    open()
    await screen.findByText('Project cost ledger')
    const calls = useQueryMock.mock.calls as [unknown, { variables?: { projectId?: string } }][]
    const call = calls.find((c) => c[1].variables?.projectId)
    expect(call?.[1].variables).toEqual({ projectId: 'project-42' })
  })

  it('puts the cost ledger above the journal lines', async () => {
    apiGet.mockResolvedValue({ data: account() })
    open()
    const ledgerTitle = await screen.findByText('Project cost ledger')
    const journalTitle = screen.getByText(/^Journal Lines/i)
    // Node.DOCUMENT_POSITION_FOLLOWING (4): the journal heading comes after the ledger heading
    expect(ledgerTitle.compareDocumentPosition(journalTitle) & 4).toBeTruthy()
  })
})

describe('an analytic account that is not a project', () => {
  it('has no cost ledger card and never asks for one', async () => {
    apiGet.mockResolvedValue({
      data: account({
        project_id: undefined,
        project_name: undefined,
        project_status: undefined,
        code: 'CC-ADMIN',
        name: 'Admin overhead',
      }),
    })
    open()
    await waitFor(() => {
      expect(screen.getByText('Admin overhead')).toBeInTheDocument()
    })
    expect(screen.queryByText('Project cost ledger')).toBeNull()
    expect(useQueryMock).not.toHaveBeenCalled()
    expect(screen.getByText('No journal lines yet.')).toBeInTheDocument()
  })
})
