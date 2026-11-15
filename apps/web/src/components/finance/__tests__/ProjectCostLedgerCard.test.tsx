// The project's cost ledger on its analytic account page (playbook #92, NY-PRJ-2026-0032).
// The page listed only journal lines TAGGED with the account, and almost nothing is tagged on purpose, so a project with 175
// cost entries said "No journal lines yet". This card lists the cost ledger instead: where each cost came from, per currency,
// newest first, with totals per currency and a plain note for every state (loading, nothing booked, not allowed, cut short).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { ProjectCostLedgerCard } from '../ProjectCostLedgerCard'

interface Entry {
  id: string
  entryDate: string | null
  sourceType: string | null
  costCategory: string | null
  amount: string
  currencyCode: string
  reference: string | null
}
interface LedgerData {
  projectCostLedger: {
    entries: Entry[]
    totals: { currencyCode: string; amount: string }[]
    truncated: boolean
  }
}

const useQueryMock = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return { ...actual, useQuery: (...a: unknown[]): unknown => useQueryMock(...a) }
})

const entry = (id: string, over: Partial<Entry> = {}): Entry => ({
  id,
  entryDate: '2026-11-10',
  sourceType: 'po_direct_delivery',
  costCategory: 'materials',
  amount: '100.0000',
  currencyCode: 'USD',
  reference: 'NY-PO-2026-0063 / line 4',
  ...over,
})

function ledger(entries: Entry[], over: Partial<LedgerData['projectCostLedger']> = {}): LedgerData {
  return {
    projectCostLedger: {
      entries,
      totals: [{ currencyCode: 'USD', amount: '945.5000' }],
      truncated: false,
      ...over,
    },
  }
}

function show(result: { data?: LedgerData; loading?: boolean; error?: Error }) {
  // one object per test: a mock that returns a fresh object per call would re-render a component with an effect for ever
  const stable = { data: result.data, loading: result.loading ?? false, error: result.error }
  useQueryMock.mockReturnValue(stable)
  return render(
    <ThemeProvider>
      <ProjectCostLedgerCard projectId="project-1" />
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

describe('the rows', () => {
  it('lists every cost with its date, source, document, category and amount in its own currency', () => {
    show({
      data: ledger([
        entry('a', {
          amount: '850.5000',
          currencyCode: 'USD',
          reference: 'NY-PO-2026-0063 / line 4',
        }),
        entry('b', { sourceType: 'stock_issue', reference: 'SO-00014', amount: '100.0000' }),
        entry('c', { sourceType: 'material_return', reference: 'MRT-0003', amount: '-5.0000' }),
        entry('d', {
          sourceType: 'po_vendor_return',
          reference: 'RTN-NY-PO-2026-0101',
          amount: '-9.0000',
        }),
        entry('e', {
          amount: '10000.0000',
          currencyCode: 'IQD',
          reference: 'NY-PO-2026-0044 / line 1',
        }),
      ]),
    })
    const rows = screen.getAllByTestId('cost-ledger-row')
    expect(rows).toHaveLength(5)
    const first = within(rows[0])
    expect(first.getByText('2026-11-10')).toBeInTheDocument()
    expect(first.getByText('Jobsite delivery')).toBeInTheDocument()
    expect(first.getByText('NY-PO-2026-0063 / line 4')).toBeInTheDocument()
    expect(first.getByText('850.50 USD')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Stock issued (Store Out)')).toBeInTheDocument()
    expect(within(rows[1]).getByText('SO-00014')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Material return')).toBeInTheDocument()
    expect(within(rows[2]).getByText('-5.00 USD')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Vendor return')).toBeInTheDocument()
    // an IQD cost is shown in IQD: nothing is converted
    expect(within(rows[4]).getByText('10,000.00 IQD')).toBeInTheDocument()
  })

  it('shows a journal source by its name, an unnamed source by its own words, and a missing value as a dash', () => {
    show({
      data: ledger([
        entry('a', { sourceType: 'po_completion', reference: 'JE-2026-0007' }),
        entry('b', {
          sourceType: 'some_new_source',
          reference: null,
          costCategory: null,
          entryDate: null,
        }),
        entry('c', { sourceType: null }),
      ]),
    })
    const rows = screen.getAllByTestId('cost-ledger-row')
    expect(within(rows[0]).getByText('PO Completion')).toBeInTheDocument()
    expect(within(rows[1]).getByText('some new source')).toBeInTheDocument()
    // date, reference and category are all missing on that row
    expect(within(rows[1]).getAllByText('—')).toHaveLength(3)
    expect(within(rows[2]).getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('never prints a raw translation key', () => {
    const { container } = show({ data: ledger([entry('a')]) })
    expect(container.textContent).not.toMatch(/fin\.analyticDetail/)
  })
})

describe('the totals', () => {
  it('shows one total per currency, from the server (never added together)', () => {
    show({
      data: ledger([entry('a')], {
        totals: [
          { currencyCode: 'IQD', amount: '8930863.0500' },
          { currencyCode: 'USD', amount: '6981.9400' },
        ],
      }),
    })
    const totals = within(screen.getByTestId('cost-ledger-totals'))
    expect(totals.getByText('8,930,863.05 IQD')).toBeInTheDocument()
    expect(totals.getByText('6,981.94 USD')).toBeInTheDocument()
  })

  it('shows no totals strip when the ledger is empty', () => {
    show({ data: ledger([], { totals: [] }) })
    expect(screen.queryByTestId('cost-ledger-totals')).toBeNull()
  })
})

describe('the states', () => {
  it('asks for this project', () => {
    show({ data: ledger([entry('a')]) })
    expect(useQueryMock).toHaveBeenCalled()
    const [, options] = useQueryMock.mock.calls[0] as [
      unknown,
      { variables: { projectId: string } },
    ]
    expect(options.variables).toEqual({ projectId: 'project-1' })
  })

  it('says it is loading while there is nothing yet, and no table', () => {
    show({ loading: true })
    expect(screen.getByTestId('cost-ledger-loading')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByTestId('cost-ledger-unavailable')).toBeNull()
  })

  it('keeps showing the rows it has while a refresh is in flight', () => {
    show({ data: ledger([entry('a')]), loading: true })
    expect(screen.getAllByTestId('cost-ledger-row')).toHaveLength(1)
    expect(screen.queryByTestId('cost-ledger-loading')).toBeNull()
  })

  it('says nothing has been booked, instead of an empty table', () => {
    show({ data: ledger([], { totals: [] }) })
    expect(screen.getByTestId('cost-ledger-empty')).toHaveTextContent(
      'No costs have been booked to this project yet.',
    )
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('explains itself when the person may not see the project (the server refused), instead of an empty card', () => {
    show({ error: new Error('Not authorized to view this project') })
    const note = screen.getByTestId('cost-ledger-unavailable')
    expect(note).toHaveTextContent(
      'The project cost ledger is shown to people who can open the project.',
    )
    expect(note).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says how many are listed when the ledger was cut short, and that the totals count them all', () => {
    show({ data: ledger([entry('a'), entry('b')], { truncated: true }) })
    expect(screen.getByTestId('cost-ledger-truncated')).toHaveTextContent(
      'Showing the newest 2 entries. The totals above count all of them.',
    )
  })

  it('has no truncation note when everything is listed', () => {
    show({ data: ledger([entry('a')]) })
    expect(screen.queryByTestId('cost-ledger-truncated')).toBeNull()
  })
})

describe('the card in Arabic', () => {
  it('reads in Arabic with no raw key and no English labels left', async () => {
    await i18n.changeLanguage('ar')
    const { container } = show({
      data: ledger([entry('a'), entry('b', { sourceType: 'stock_issue' })]),
    })
    expect(container.textContent).not.toMatch(/fin\.analyticDetail/)
    expect(screen.getByText('سجل تكاليف المشروع')).toBeInTheDocument()
    expect(screen.getByText('تسليم إلى موقع العمل')).toBeInTheDocument()
    expect(screen.getByText('مخزون مصروف (إخراج من المخزن)')).toBeInTheDocument()
    expect(screen.queryByText('Jobsite delivery')).toBeNull()
    expect(screen.queryByText('Project cost ledger')).toBeNull()
  })

  it('has an Arabic note for every state', async () => {
    await i18n.changeLanguage('ar')
    show({ error: new Error('x') })
    expect(screen.getByTestId('cost-ledger-unavailable')).toHaveTextContent(
      'يُعرض سجل تكاليف المشروع',
    )
  })
})
