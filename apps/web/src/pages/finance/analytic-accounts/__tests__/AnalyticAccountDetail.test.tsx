// The analytic account page of a project (playbook #92, NY-PRJ-2026-0032): it said "Total Lines 0" and "No journal lines yet"
// for a project with 175 cost entries, because the cost of a project is not journal-tagged. The page now carries the
// project's cost ledger above its journal lines, for an account that belongs to a project, and only then.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
      byKind: [
        {
          currencyCode: 'USD',
          sourceType: 'po_direct_delivery',
          amount: '850.5000',
          entryCount: 1,
        },
      ],
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

// playbook #95: the top row counted only the journal lines TAGGED with the account ("Total Lines 18", 1,210,250 IQD, the
// expense claims) right above a cost ledger of 10,131,604.55 IQD and 10,359.00 USD: two numbers on one page.
describe('the top row of the page', () => {
  const taggedOnly = {
    journal_line_count: 18,
    currency_totals: [
      { currency_code: 'IQD', total_debits: '1210250.0000', total_credits: '0.0000' },
    ],
  }

  it("shows the project's cost per currency, not the tagged journal lines, for an account of a project", async () => {
    apiGet.mockResolvedValue({ data: account(taggedOnly) })
    open()
    const summary = await screen.findByTestId('cost-summary')
    expect(within(summary).getByTestId('cost-summary-total')).toHaveTextContent('850.50 USD')
    // the second, smaller number is gone
    expect(screen.queryByText('Total Lines')).toBeNull()
    expect(screen.queryByText(/Total Debits/)).toBeNull()
    expect(screen.queryByText(/1,210,250/)).toBeNull()
  })

  it('puts the cost summary above the cost ledger', async () => {
    apiGet.mockResolvedValue({ data: account(taggedOnly) })
    open()
    const summary = await screen.findByTestId('cost-summary')
    const ledgerTitle = screen.getByText('Project cost ledger')
    // Node.DOCUMENT_POSITION_FOLLOWING (4): the ledger heading comes after the summary row
    expect(summary.compareDocumentPosition(ledgerTitle) & 4).toBeTruthy()
  })

  it('says its journal table holds only the lines tagged to the account, and where the full cost is', async () => {
    apiGet.mockResolvedValue({ data: account(taggedOnly) })
    open()
    expect(await screen.findByText('Journal lines tagged to this account')).toBeInTheDocument()
    expect(screen.getByTestId('journal-lines-tagged-hint')).toHaveTextContent(
      "Only entries tagged with this account. The project's full cost is in the cost ledger above.",
    )
  })

  it('keeps the journal totals and the plain heading for an account that is not a project', async () => {
    apiGet.mockResolvedValue({
      data: account({
        ...taggedOnly,
        project_id: undefined,
        project_name: undefined,
        project_status: undefined,
        code: 'CC-ADMIN',
        name: 'Admin overhead',
      }),
    })
    open()
    expect(await screen.findByText('Total Lines')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText(/Total Debits: 1,210,250\.00 IQD/)).toBeInTheDocument()
    expect(screen.getByText('Journal Lines')).toBeInTheDocument()
    expect(screen.queryByText('Journal lines tagged to this account')).toBeNull()
    expect(screen.queryByTestId('journal-lines-tagged-hint')).toBeNull()
    expect(screen.queryByTestId('cost-summary')).toBeNull()
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
