// One advance per currency on the PO page (migration 324, playbook #90).
//
// A PO with lines in IQD and USD could only be linked to ONE advance (the page had a single dropdown listing every currency, and
// the server accepted only the PO's header currency), so the other currency's lines had nothing to be paid from. Now the picker
// shows one advance box per currency of the PO, each listing only that currency's advances, takes the only advance on offer for
// you, and confirms only when every currency has one. A PO in one currency looks and works as before. Renders the real page.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ComponentType } from 'react'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})
vi.mock('../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn() }
})

let perms: Record<string, boolean> = {}
vi.mock('../../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: (k: string) => !!perms[k],
    canAny: () => false,
    isSystemLevel: false,
  }),
}))

interface AdvanceRow {
  id: string
  advance_number: string
  outstanding_amount: number
  currency_code: string
  status: string
}
let advancesByEmployee: Record<string, AdvanceRow[]> = {}
vi.mock('../../../lib/axios', () => ({
  api: {
    get: vi.fn((url: string, config?: { params?: { employee_id?: string } }) => {
      if (url === '/finance/advances')
        return Promise.resolve({
          data: advancesByEmployee[config?.params?.employee_id ?? ''] ?? [],
        })
      return Promise.resolve({ data: url === '/finance/vendor-invoices' ? { items: [] } : [] })
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

const EMPLOYEES = [
  { id: 'emp-1', first_name: 'Hana', last_name: 'Karim' },
  { id: 'emp-2', first_name: 'Omar', last_name: 'Aziz' },
]
const adv = (
  id: string,
  currency: string,
  status = 'approved',
  outstanding = 1_000_000,
): AdvanceRow => ({
  id,
  advance_number: `ADV-${id}`,
  outstanding_amount: outstanding,
  currency_code: currency,
  status,
})

const line = (id: string, currency: string, total: number) => ({
  id,
  description: `Item ${id}`,
  qty: 1,
  unit_price: total,
  initial_unit_price: total,
  total,
  actual_unit_price: total,
  currency_code: currency,
  product_id: null,
  product_name: null,
  uom: 'pc',
  qty_received: 1,
  qty_from_stock: 0,
  account_id: null,
  cost_center_id: null,
})

function mockPO(
  over: Record<string, unknown> = {},
  lines = [line('l1', 'IQD', 100000), line('l2', 'IQD', 25000), line('l3', 'USD', 350)],
) {
  const totals = [...new Set(lines.map((l) => l.currency_code))].sort().map((c) => ({
    currency_code: c,
    subtotal: String(lines.filter((l) => l.currency_code === c).reduce((s, l) => s + l.total, 0)),
    line_count: lines.filter((l) => l.currency_code === c).length,
  }))
  const po = {
    id: 'po-1',
    po_number: 'NY-PO-2026-0101',
    vendor_name: 'Cash Purchase',
    currency_code: 'IQD',
    status: 'payment_pending',
    subtotal: null,
    tax_amount: '0',
    total_amount: null,
    currencyTotals: totals,
    notes: '',
    expected_delivery_date: '',
    created_at: '2026-11-09T10:00:00.000Z',
    callerIsFinanceTeam: true,
    funding_source: 'vendor_ap',
    funding_decided: false,
    funding_advance_id: null,
    receipts: [],
    approval_log: [],
    edit_requests: [],
    lines,
    ...over,
  }
  // Built ONCE and handed back by reference: a mock that returns a fresh `data` object on every call loops any component whose
  // effect depends on query data until the worker runs out of memory (playbook #60.3).
  const refetch = vi.fn()
  const employeesResult = { data: { employees: EMPLOYEES }, loading: false, refetch }
  const poResult = {
    data: { purchaseOrder: po, poFxRates: { base_currency: 'IQD', rates: [] } },
    loading: false,
    refetch,
  }
  mockUseQuery.mockImplementation((doc: { definitions?: { name?: { value?: string } }[] }) =>
    doc.definitions?.[0]?.name?.value === 'Employees' ? employeesResult : poResult,
  )
}

let PurchaseOrderDetail: ComponentType
beforeAll(async () => {
  PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
}, 120_000)

async function openPO() {
  const view = render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders/po-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/procurement/purchase-orders/:id" element={<PurchaseOrderDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return view
}

const t = (k: string, o?: Record<string, unknown>) => i18n.t(`po.detail.${k}`, o)
const setFundingCalls: { variables: Record<string, unknown> }[] = []

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setFundingCalls.length = 0
  perms = { 'finance.ap.view': true, 'finance.ap.approve': true, 'finance.ap.edit': true }
  advancesByEmployee = {}
  mockUseMutation.mockImplementation((doc: { definitions?: { name?: { value?: string } }[] }) => {
    const name = doc.definitions?.[0]?.name?.value
    if (name === 'SetPOFunding') {
      return [
        (args: { variables: Record<string, unknown> }) => {
          setFundingCalls.push(args)
          return Promise.resolve({})
        },
        { loading: false },
      ]
    }
    return [vi.fn().mockResolvedValue({}), { loading: false }]
  })
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

const clickAdvanceFunding = () =>
  fireEvent.click(screen.getByRole('button', { name: t('employeeAdvance') }))
async function chooseEmployee(name: string, from = t('selectEmployee')) {
  const shown = screen.getAllByText(from)
  fireEvent.click(shown[shown.length - 1])
  fireEvent.mouseDown(screen.getByText(name))
  // the employee's advances load asynchronously
  await act(async () => {
    await Promise.resolve()
  })
}
// the tile is the box holding the caption; fail with a message, not a null, if the page changes
function fundedByTile(): HTMLElement {
  const box = screen.getByText(t('fundedByAdvance')).parentElement
  if (!box) throw new Error('the Funded by advance tile has no container')
  return box
}
const confirmButton = () => screen.getByRole('button', { name: t('confirmFundingSource') })
function advanceBox(currency: string): HTMLSelectElement {
  const el = document.getElementById(`funding-advance-${currency}`)
  if (!(el instanceof HTMLSelectElement)) throw new Error(`no advance box for ${currency}`)
  return el
}
const optionIds = (box: HTMLSelectElement) =>
  within(box)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value)
    .filter(Boolean)

describe('a PO with lines in two currencies', () => {
  it('asks for one advance per currency, each box named for its currency, with what the PO holds in it', async () => {
    mockPO()
    await openPO()
    clickAdvanceFunding()
    expect(
      screen.getByText(t('fundingNeedsAdvancePerCurrency', { currencies: 'IQD + USD' })),
    ).toBeInTheDocument()
    expect(screen.getByText(t('advanceForCurrency', { currency: 'IQD' }))).toBeInTheDocument()
    expect(screen.getByText(t('advanceForCurrency', { currency: 'USD' }))).toBeInTheDocument()
    expect(
      screen.getByText(t('poAmountInCurrency', { amount: '125,000', currency: 'IQD' })),
    ).toBeInTheDocument()
    expect(
      screen.getByText(t('poAmountInCurrency', { amount: '350', currency: 'USD' })),
    ).toBeInTheDocument()
    // nothing to choose from until an employee is picked
    expect(
      within(advanceBox('IQD')).getByRole('option', { name: t('selectEmployeeFirst') }),
    ).toBeInTheDocument()
    expect(confirmButton()).toBeDisabled()
  })

  it("each box offers only its own currency's advances that can still pay, never another's", async () => {
    mockPO()
    advancesByEmployee['emp-1'] = [
      adv('i1', 'IQD'),
      adv('i2', 'IQD', 'partially_settled'),
      adv('u1', 'USD'),
      adv('u2', 'USD'),
      adv('e1', 'EUR'),
      adv('d1', 'IQD', 'draft'),
    ]
    await openPO()
    clickAdvanceFunding()
    await chooseEmployee('Hana Karim')
    expect(optionIds(advanceBox('IQD'))).toEqual(['i1', 'i2'])
    expect(optionIds(advanceBox('USD'))).toEqual(['u1', 'u2'])
  })

  it('takes the only advance on offer for a currency, leaves a currency with a choice for you, and confirms only when both are chosen', async () => {
    mockPO()
    advancesByEmployee['emp-1'] = [adv('i1', 'IQD'), adv('u1', 'USD'), adv('u2', 'USD')]
    await openPO()
    clickAdvanceFunding()
    await chooseEmployee('Hana Karim')
    expect(advanceBox('IQD').value).toBe('i1') // the only IQD advance: nothing to decide
    expect(advanceBox('USD').value).toBe('') // two to choose from
    expect(confirmButton()).toBeDisabled()
    fireEvent.change(advanceBox('USD'), { target: { value: 'u2' } })
    expect(confirmButton()).toBeEnabled()
  })

  it('sends one advance per currency, and not the old single advance', async () => {
    mockPO()
    advancesByEmployee['emp-1'] = [adv('i1', 'IQD'), adv('u1', 'USD'), adv('u2', 'USD')]
    await openPO()
    clickAdvanceFunding()
    await chooseEmployee('Hana Karim')
    fireEvent.change(advanceBox('USD'), { target: { value: 'u2' } })
    fireEvent.click(confirmButton())
    expect(setFundingCalls).toHaveLength(1)
    expect(setFundingCalls[0].variables).toEqual({
      id: 'po-1',
      fundingSource: 'employee_advance',
      fundingAdvances: [
        { currencyCode: 'IQD', advanceId: 'i1' },
        { currencyCode: 'USD', advanceId: 'u2' },
      ],
    })
    expect(setFundingCalls[0].variables).not.toHaveProperty('fundingAdvanceId')
  })

  it('cannot be confirmed with an advance for only one of the two currencies, and says which one has none', async () => {
    mockPO()
    advancesByEmployee['emp-1'] = [adv('i1', 'IQD')] // no USD advance at all
    await openPO()
    clickAdvanceFunding()
    await chooseEmployee('Hana Karim')
    expect(advanceBox('IQD').value).toBe('i1')
    expect(
      within(advanceBox('USD')).getByRole('option', {
        name: t('noAdvanceInCurrency', { currency: 'USD' }),
      }),
    ).toBeInTheDocument()
    expect(confirmButton()).toBeDisabled()
    fireEvent.click(confirmButton())
    expect(setFundingCalls).toHaveLength(0)
  })

  it("switching employee drops the first employee's choices, so none of their advances can be submitted", async () => {
    mockPO()
    advancesByEmployee['emp-1'] = [adv('i1', 'IQD'), adv('u1', 'USD')]
    advancesByEmployee['emp-2'] = [] // the second employee holds none
    await openPO()
    clickAdvanceFunding()
    await chooseEmployee('Hana Karim')
    expect(confirmButton()).toBeEnabled() // both auto-picked
    await chooseEmployee('Omar Aziz', 'Hana Karim')
    expect(advanceBox('IQD').value).toBe('')
    expect(advanceBox('USD').value).toBe('')
    expect(confirmButton()).toBeDisabled()
  })

  it('a currency the PO has no lines in gets no box, however many advances the employee holds', async () => {
    mockPO()
    advancesByEmployee['emp-1'] = [adv('i1', 'IQD'), adv('u1', 'USD'), adv('e1', 'EUR')]
    await openPO()
    clickAdvanceFunding()
    await chooseEmployee('Hana Karim')
    expect(document.getElementById('funding-advance-EUR')).toBeNull()
  })

  it('uses the stored currency of the lines, not the header: an IQD+USD PO with a USD header still has both boxes', async () => {
    mockPO({ currency_code: 'USD' })
    await openPO()
    clickAdvanceFunding()
    expect(advanceBox('IQD')).toBeInTheDocument()
    expect(advanceBox('USD')).toBeInTheDocument()
  })
})

describe('a PO in one currency works as before', () => {
  const onlyIqd = () => {
    mockPO({}, [line('l1', 'IQD', 100000), line('l2', 'IQD', 25000)])
  }

  it('has one box, plainly labelled Advance, listing only that currency, with no per-currency wording', async () => {
    onlyIqd()
    advancesByEmployee['emp-1'] = [adv('i1', 'IQD'), adv('i2', 'IQD'), adv('u1', 'USD')]
    await openPO()
    clickAdvanceFunding()
    await chooseEmployee('Hana Karim')
    expect(screen.getByText(t('advance'))).toBeInTheDocument()
    expect(screen.queryByText(t('advanceForCurrency', { currency: 'IQD' }))).toBeNull()
    expect(
      screen.queryByText(t('fundingNeedsAdvancePerCurrency', { currencies: 'IQD' })),
    ).toBeNull()
    expect(optionIds(advanceBox('IQD'))).toEqual(['i1', 'i2']) // the USD advance would only be refused by the server
    expect(document.getElementById('funding-advance-USD')).toBeNull()
  })

  it('sends its one advance in the new list form, and waits until it is chosen', async () => {
    onlyIqd()
    advancesByEmployee['emp-1'] = [adv('i1', 'IQD'), adv('i2', 'IQD')]
    await openPO()
    clickAdvanceFunding()
    await chooseEmployee('Hana Karim')
    expect(confirmButton()).toBeDisabled() // two to choose from
    fireEvent.change(advanceBox('IQD'), { target: { value: 'i2' } })
    fireEvent.click(confirmButton())
    expect(setFundingCalls[0].variables).toEqual({
      id: 'po-1',
      fundingSource: 'employee_advance',
      fundingAdvances: [{ currencyCode: 'IQD', advanceId: 'i2' }],
    })
  })

  it('vendor AP still sends no advance at all', async () => {
    mockPO()
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: t('vendorAccountsPayable') }))
    fireEvent.click(confirmButton())
    expect(setFundingCalls).toEqual([
      { variables: { id: 'po-1', fundingSource: 'vendor_ap', fundingAdvances: undefined } },
    ])
  })
})

describe('the Funded by advance tile', () => {
  it('names both advances with their currency when the PO is paid from two, each linking to its own page', async () => {
    mockPO({
      funding_source: 'employee_advance',
      funding_decided: true,
      funding_advance_id: 'i1',
      funding_advance_number: 'ADV-i1',
      fundingAdvances: [
        {
          currency_code: 'IQD',
          advance_id: 'i1',
          advance_number: 'ADV-i1',
          employee_name: 'Hana Karim',
        },
        {
          currency_code: 'USD',
          advance_id: 'u1',
          advance_number: 'ADV-u1',
          employee_name: 'Hana Karim',
        },
      ],
    })
    await openPO()
    const tile = fundedByTile()
    const links = within(tile).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['ADV-i1', '/finance/advances/i1'],
      ['ADV-u1', '/finance/advances/u1'],
    ])
    expect(tile).toHaveTextContent('IQD · ADV-i1')
    expect(tile).toHaveTextContent('USD · ADV-u1')
  })

  it('shows the single advance as before when there is one', async () => {
    mockPO(
      {
        funding_source: 'employee_advance',
        funding_decided: true,
        funding_advance_id: 'i1',
        funding_advance_number: 'ADV-i1',
        funding_employee_name: 'Hana Karim',
        fundingAdvances: [
          {
            currency_code: 'IQD',
            advance_id: 'i1',
            advance_number: 'ADV-i1',
            employee_name: 'Hana Karim',
          },
        ],
      },
      [line('l1', 'IQD', 100000)],
    )
    await openPO()
    const tile = fundedByTile()
    expect(within(tile).getAllByRole('link')).toHaveLength(1)
    expect(tile).toHaveTextContent('ADV-i1 · Hana Karim')
  })
})

describe('in Arabic', () => {
  it('every new string has its own text, none is a raw key', async () => {
    await i18n.changeLanguage('ar')
    mockPO()
    advancesByEmployee['emp-1'] = [adv('i1', 'IQD')]
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('po.detail.employeeAdvance') }))
    expect(
      screen.getByText(
        i18n.t('po.detail.fundingNeedsAdvancePerCurrency', { currencies: 'IQD + USD' }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t('po.detail.advanceForCurrency', { currency: 'USD' })),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t('po.detail.poAmountInCurrency', { amount: '350', currency: 'USD' })),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(
      /po\.detail\.(advanceForCurrency|noAdvanceInCurrency|poAmountInCurrency|fundingNeedsAdvancePerCurrency)/,
    )
    expect(i18n.t('po.detail.noAdvanceInCurrency', { currency: 'USD' })).not.toMatch(/po\.detail/)
  })
})
