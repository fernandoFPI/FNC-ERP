// The top row of a project's analytic account page (playbook #95, NY-PRJ-2026-0032). It counted only the journal lines TAGGED with
// the account ("Total Lines 18", 1,210,250 IQD) directly above a cost ledger that said 10,131,604.55 IQD and 10,359.00 USD. The
// row now shows what the project's cost adds up to per currency, split by kind, from the same ledger the header reads.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { ProjectCostSummaryCards } from '../ProjectCostSummaryCards'

interface Kind {
  currencyCode: string
  sourceType: string | null
  amount: string
  entryCount: number
}
interface LedgerData {
  projectCostLedger: {
    entries: unknown[]
    totals: { currencyCode: string; amount: string }[]
    byKind: Kind[]
    truncated: boolean
  }
}

const useQueryMock = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return { ...actual, useQuery: (...a: unknown[]): unknown => useQueryMock(...a) }
})

const kind = (currencyCode: string, sourceType: string | null, amount: string): Kind => ({
  currencyCode,
  sourceType,
  amount,
  entryCount: 1,
})

// what production holds for NY-PRJ-2026-0032 after the Store Out split
function ny0032(): LedgerData {
  return {
    projectCostLedger: {
      entries: [],
      totals: [
        { currencyCode: 'IQD', amount: '10131604.5500' },
        { currencyCode: 'USD', amount: '10359.0020' },
      ],
      byKind: [
        kind('IQD', 'combined', '1210250.0000'),
        kind('IQD', 'material_return', '-8000.0000'),
        kind('IQD', 'po_direct_delivery', '8833054.5500'),
        kind('IQD', 'stock_issue', '96300.0000'),
        kind('USD', 'material_return', '-158.5380'),
        kind('USD', 'po_direct_delivery', '6981.9400'),
        kind('USD', 'stock_issue', '3535.6000'),
      ],
      truncated: false,
    },
  }
}

function show(result: { data?: LedgerData; loading?: boolean; error?: Error }) {
  // one object per test: a mock that returns a fresh object per call would re-render a component with an effect for ever
  const stable = { data: result.data, loading: result.loading ?? false, error: result.error }
  useQueryMock.mockReturnValue(stable)
  return render(
    <ThemeProvider>
      <ProjectCostSummaryCards projectId="project-1" />
    </ThemeProvider>,
  )
}

beforeEach(async () => {
  useQueryMock.mockReset()
  await i18n.changeLanguage('en')
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('the cards', () => {
  it('shows one card per currency with the project cost as the headline, each in its own currency', () => {
    show({ data: ny0032() })
    const iqd = within(screen.getByTestId('cost-summary-IQD'))
    const usd = within(screen.getByTestId('cost-summary-USD'))
    expect(iqd.getByText('Project cost (IQD)')).toBeInTheDocument()
    expect(iqd.getByTestId('cost-summary-total')).toHaveTextContent('10,131,604.55 IQD')
    expect(usd.getByText('Project cost (USD)')).toBeInTheDocument()
    expect(usd.getByTestId('cost-summary-total')).toHaveTextContent('10,359.00 USD')
    // nothing is converted or mixed: the USD card never mentions IQD and the other way round
    expect(screen.getByTestId('cost-summary-USD')).not.toHaveTextContent('IQD')
    expect(screen.getByTestId('cost-summary-IQD')).not.toHaveTextContent('USD')
  })

  it('splits each currency by kind of cost, with the amount of each', () => {
    show({ data: ny0032() })
    const usdKinds = within(screen.getByTestId('cost-summary-USD')).getAllByTestId(
      'cost-summary-kind',
    )
    expect(usdKinds.map((e) => e.textContent)).toEqual([
      'Jobsite delivery6,981.94 USD',
      'Stock issued (Store Out)3,535.60 USD',
      'Material return-158.54 USD',
    ])
    const iqdKinds = within(screen.getByTestId('cost-summary-IQD')).getAllByTestId(
      'cost-summary-kind',
    )
    expect(iqdKinds.map((e) => e.textContent)).toEqual([
      'Jobsite delivery8,833,054.55 IQD',
      'Stock issued (Store Out)96,300.00 IQD',
      'Material return-8,000.00 IQD',
      'Combined journal entry1,210,250.00 IQD',
    ])
  })

  it('shows the headline the server totalled, it does not add the kinds up in the browser', () => {
    const data = ny0032()
    // a total that deliberately differs from the sum of its kinds: whatever is shown must be the server's
    data.projectCostLedger.totals = [{ currencyCode: 'USD', amount: '123.0000' }]
    data.projectCostLedger.byKind = [kind('USD', 'po_direct_delivery', '100.0000')]
    show({ data })
    expect(screen.getByTestId('cost-summary-total')).toHaveTextContent('123.00 USD')
  })

  it('names a kind nobody has named by its own words, and a cost with no source as Other', () => {
    const data = ny0032()
    data.projectCostLedger.totals = [{ currencyCode: 'USD', amount: '30.0000' }]
    data.projectCostLedger.byKind = [
      kind('USD', 'some_new_source', '10.0000'),
      kind('USD', null, '20.0000'),
    ]
    show({ data })
    const kinds = screen.getAllByTestId('cost-summary-kind').map((e) => e.textContent)
    expect(kinds).toEqual(['some new source10.00 USD', 'Other20.00 USD'])
  })

  it('never prints a raw translation key', () => {
    const { container } = show({ data: ny0032() })
    expect(container.textContent).not.toMatch(/fin\.analyticDetail/)
  })
})

describe('the states', () => {
  it('asks for this project', () => {
    show({ data: ny0032() })
    const [, options] = useQueryMock.mock.calls[0] as [
      unknown,
      { variables: { projectId: string } },
    ]
    expect(options.variables).toEqual({ projectId: 'project-1' })
  })

  it('shows a placeholder while there is nothing yet', () => {
    show({ loading: true })
    expect(screen.getByTestId('cost-summary-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('cost-summary')).toBeNull()
  })

  it('keeps showing the cards it has while a refresh is in flight', () => {
    show({ data: ny0032(), loading: true })
    expect(screen.getByTestId('cost-summary')).toBeInTheDocument()
    expect(screen.queryByTestId('cost-summary-loading')).toBeNull()
  })

  it('shows nothing when the person may not see the project (the ledger card says why)', () => {
    const { container } = show({ error: new Error('Not authorized to view this project') })
    expect(container.textContent).toBe('')
    expect(screen.queryByTestId('cost-summary')).toBeNull()
    expect(screen.queryByTestId('cost-summary-loading')).toBeNull()
  })

  it('shows nothing when no cost has been booked yet', () => {
    const data = ny0032()
    data.projectCostLedger.totals = []
    data.projectCostLedger.byKind = []
    const { container } = show({ data })
    expect(container.textContent).toBe('')
  })
})

describe('in Arabic', () => {
  it('reads in Arabic with no raw key and no English labels left', async () => {
    await i18n.changeLanguage('ar')
    const { container } = show({ data: ny0032() })
    expect(container.textContent).not.toMatch(/fin\.analyticDetail/)
    expect(screen.getByText('تكلفة المشروع (USD)')).toBeInTheDocument()
    expect(screen.getByText('تكلفة المشروع (IQD)')).toBeInTheDocument()
    expect(screen.getAllByText('تسليم إلى موقع العمل')).toHaveLength(2)
    expect(screen.getByText('قيد يومية مدمج')).toBeInTheDocument()
    expect(screen.queryByText('Jobsite delivery')).toBeNull()
    expect(screen.queryByText('Project cost (USD)')).toBeNull()
  })
})
