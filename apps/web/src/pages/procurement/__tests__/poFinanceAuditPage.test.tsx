// The PO page at Finance review / audit: the audit happens in the Purchase Order Lines card (a Check column with OK / Flag on
// each line, a progress bar in the card's header) and the step's two buttons are in the bar at the bottom. Gates are the old
// panel's: system-level users and the finance team audit; everyone else sees a bar that only explains.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { themes } from '../../../theme/tokens'
import { PO_RETURNS_QUERY, VENDORS_QUERY } from '../../../graphql/procurement'

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

let systemLevel = false
vi.mock('../../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => false, canAny: () => false, isSystemLevel: systemLevel }),
}))
let lockedByOther = false
vi.mock('../../../hooks/useRecordLock', () => ({
  useRecordLock: () => ({
    loading: false,
    lockedByMe: !lockedByOther,
    lockedByOther,
    lockedByName: lockedByOther ? 'Sara Ali' : null,
  }),
}))
vi.mock('../../../lib/axios', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

type Line = Record<string, unknown>
const line = (id: string, over: Line = {}): Line => ({
  id,
  description: `Item ${id}`,
  product_id: null,
  product_name: null,
  uom: 'pc',
  qty: 4,
  qty_received: 4,
  qty_from_stock: 0,
  unit_price: 1000,
  initial_unit_price: 1000,
  total: 4000,
  actual_unit_price: 1000,
  currency_code: 'IQD',
  market_price_currency: 'IQD',
  requested_currency_code: null,
  account_id: null,
  cost_center_id: null,
  audit_status: null,
  audit_note: null,
  ...over,
})

const results = {
  po: { data: undefined as unknown, loading: false, refetch: vi.fn() },
  returns: { data: { poReturns: [] as unknown[] }, loading: false },
  vendors: { data: { vendors: [] as unknown[] }, loading: false },
}
function mockPO(status: string, over: Record<string, unknown> = {}) {
  const po = {
    id: 'po-1',
    po_number: 'PO-2026-0056',
    vendor_id: 'v1',
    vendor_name: 'Cash Purchase',
    currency_code: 'IQD',
    status,
    priority: 'low',
    requisition_id: 'req-1',
    requisitionNumber: 'REQ-2026-0045',
    subtotal: null,
    tax_amount: '0',
    total_amount: null,
    currencyTotals: [{ currency_code: 'IQD', subtotal: '8000', line_count: 2 }],
    notes: '',
    expected_delivery_date: '',
    created_at: '2026-10-24T10:00:00.000Z',
    created_by_email: 'buyer@example.com',
    callerIsFinanceTeam: true,
    funding_source: 'vendor_ap',
    funding_decided: false,
    funding_advance_id: null,
    receipts: [],
    approval_log: [],
    edit_requests: [],
    lines: [line('l1'), line('l2')],
    ...over,
  }
  results.po = {
    data: {
      purchaseOrder: po,
      poFxRates: { base_currency: 'IQD', rates: [{ currency_code: 'IQD' }] },
    },
    loading: false,
    refetch: vi.fn(),
  }
}

const mutationCalls = new Map<string, ReturnType<typeof vi.fn>>()
const mutation = (name: string) => {
  let fn = mutationCalls.get(name)
  if (!fn) {
    fn = vi.fn().mockResolvedValue({})
    mutationCalls.set(name, fn)
  }
  return fn
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
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  systemLevel = false
  lockedByOther = false
  mutationCalls.clear()
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === PO_RETURNS_QUERY) return results.returns
    if (doc === VENDORS_QUERY) return results.vendors
    return results.po
  })
  mockUseMutation.mockImplementation((doc: { definitions?: { name?: { value?: string } }[] }) => [
    mutation(doc.definitions?.[0]?.name?.value ?? 'unknown'),
    { loading: false },
  ])
})
afterEach(async () => {
  setWidth(1024)
  await i18n.changeLanguage('en')
})

// the bar's badge is the last element with this text (the card header says it too, above it)
const lastText = (text: string) => {
  const all = screen.getAllByText(text)
  return all[all.length - 1]
}
const checkGroup = (item: string) => screen.getByRole('group', { name: `Check: ${item}` })
const barTitle = () => screen.queryByText('Next Step: Finance audit')
const nextStepCard = () => screen.queryByText('Next Step')
const choice = (item: string, name: 'OK' | 'Flag') =>
  within(checkGroup(item)).getByRole('button', { name: new RegExp(name) })

describe('Finance review: the audit is in the Lines card', () => {
  it('has no card of its own: the lines are checked in the Purchase Order Lines card', async () => {
    mockPO('finance_audit')
    await openPO()
    expect(nextStepCard()).not.toBeInTheDocument()
    expect(screen.getAllByText('Finance Audit — mark each line OK or Flagged')).toHaveLength(1)
    // the one instruction sits in the Lines card, under its title
    expect(screen.getByText('Purchase Order Lines')).toBeInTheDocument()
  })

  it('gives every line an OK and a Flag button, named for the line', async () => {
    mockPO('finance_audit')
    await openPO()
    expect(choice('Item l1', 'OK')).toBeInTheDocument()
    expect(choice('Item l1', 'Flag')).toBeInTheDocument()
    expect(choice('Item l2', 'OK')).toBeInTheDocument()
  })

  it('shows how far the audit has got in the card header, and that it moves as lines are checked', async () => {
    mockPO('finance_audit', { lines: [line('l1', { audit_status: 'ok' }), line('l2')] })
    await openPO()
    expect(screen.getAllByText('Lines checked: 1 of 2').length).toBeGreaterThan(0)
    const bar = screen.getAllByRole('progressbar', { name: 'Lines checked: 1 of 2' })[0]
    expect(bar).toHaveAttribute('aria-valuenow', '50')
  })

  it('marks the line that is already ok as pressed, and tints it', async () => {
    mockPO('finance_audit', { lines: [line('l1', { audit_status: 'ok' }), line('l2')] })
    await openPO()
    expect(choice('Item l1', 'OK')).toHaveAttribute('aria-pressed', 'true')
    expect(choice('Item l1', 'Flag')).toHaveAttribute('aria-pressed', 'false')
    expect(choice('Item l2', 'OK')).toHaveAttribute('aria-pressed', 'false')
  })

  it('puts the audit column in the table even for G1 child POs (Finance review), not only Finance audit', async () => {
    mockPO('finance_review')
    await openPO()
    expect(choice('Item l1', 'OK')).toBeInTheDocument()
    expect(barTitle()).toBeInTheDocument()
  })

  it('shows the actual price column by default while auditing, with the PO price compared', async () => {
    mockPO('finance_audit', {
      lines: [line('l1', { qty: 1, unit_price: 100, actual_unit_price: 110 }), line('l2')],
    })
    await openPO()
    expect(screen.getByRole('columnheader', { name: 'Actual price' })).toBeInTheDocument()
    expect(screen.getByText('▲ +10.0% vs PO')).toBeInTheDocument()
  })

  it('does not report a difference too small to matter (a rounding of the price)', async () => {
    mockPO('finance_audit', {
      lines: [line('l1', { qty: 1, unit_price: 100000, actual_unit_price: 100001 }), line('l2')],
    })
    await openPO()
    expect(screen.queryByText(/vs PO/)).not.toBeInTheDocument()
  })

  it('a price below the PO price is a green drop', async () => {
    mockPO('finance_audit', {
      lines: [line('l1', { qty: 1, unit_price: 100, actual_unit_price: 90 }), line('l2')],
    })
    await openPO()
    const note = screen.getByText('▼ -10.0% vs PO')
    expect(note).toHaveStyle({ color: themes['light-flat'].success })
  })

  it('warns when the buyer has not recorded a price', async () => {
    mockPO('finance_audit', { lines: [line('l1', { actual_unit_price: null }), line('l2')] })
    await openPO()
    expect(screen.getByText(i18n.t('po.detail.notEnteredYetBuyerHasnT'))).toBeInTheDocument()
  })

  it('says how far short a line is, under what arrived', async () => {
    mockPO('finance_audit', { lines: [line('l1', { qty: 4, qty_received: 1 }), line('l2')] })
    await openPO()
    expect(screen.getByText('(3 short)')).toBeInTheDocument()
  })

  it('and how far over', async () => {
    mockPO('finance_audit', { lines: [line('l1', { qty: 4, qty_received: 6 }), line('l2')] })
    await openPO()
    expect(screen.getByText('(over by 2)')).toBeInTheDocument()
  })

  it('does not say short or over outside the audit', async () => {
    mockPO('goods_received', { lines: [line('l1', { qty: 4, qty_received: 1 }), line('l2')] })
    await openPO()
    expect(screen.queryByText('(3 short)')).not.toBeInTheDocument()
  })

  it('a line taken entirely from stock buys nothing, so no price is asked of the buyer', async () => {
    mockPO('finance_audit', {
      lines: [
        line('l1', { qty: 5, qty_received: 0, qty_from_stock: 5, actual_unit_price: null }),
        line('l2'),
      ],
    })
    await openPO()
    expect(screen.queryByText(i18n.t('po.detail.notEnteredYetBuyerHasnT'))).not.toBeInTheDocument()
  })

  it('says what the purchased part comes to when stock covered some of the line', async () => {
    mockPO('finance_audit', {
      lines: [
        line('l1', {
          qty: 5,
          qty_received: 3,
          qty_from_stock: 2,
          unit_price: 100,
          actual_unit_price: 100,
        }),
        line('l2'),
      ],
    })
    await openPO()
    expect(screen.getByText('Purchase Total: 300 IQD (3 pc × 100)')).toBeInTheDocument()
  })

  it('tints a line that is ok, and leaves an unchecked one plain', async () => {
    mockPO('finance_audit', { lines: [line('l1', { audit_status: 'ok' }), line('l2')] })
    await openPO()
    const row = (name: string) => {
      const tr = screen.getByText(name).closest('tr')
      if (!tr) throw new Error(`no row for ${name}`)
      return tr
    }
    expect(row('Item l1').style.background).not.toBe('transparent')
    expect(row('Item l1').style.background).not.toBe('')
    expect(row('Item l2').style.background).toBe('transparent')
  })

  it('shows no audit controls on any other status', async () => {
    mockPO('goods_received')
    await openPO()
    expect(screen.queryByRole('group', { name: /^Check:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Check' })).not.toBeInTheDocument()
    expect(screen.queryByText('Lines checked: 0 of 2')).not.toBeInTheDocument()
  })
})

describe('Finance review: OK and Flag', () => {
  it('OK marks the line ok, with no note', async () => {
    mockPO('finance_audit')
    await openPO()
    fireEvent.click(choice('Item l2', 'OK'))
    expect(mutation('SetPOLineAuditStatus')).toHaveBeenCalledWith({
      variables: { poId: 'po-1', lineId: 'l2', auditStatus: 'ok' },
    })
  })

  it('Flag opens a reason box under the line instead of saving at once', async () => {
    mockPO('finance_audit')
    await openPO()
    fireEvent.click(choice('Item l1', 'Flag'))
    expect(screen.getByText(/Flag reason \(required\)/)).toBeInTheDocument()
    expect(mutation('SetPOLineAuditStatus')).not.toHaveBeenCalled()
  })

  it('a flag cannot be saved without a reason, and is saved with the reason trimmed', async () => {
    mockPO('finance_audit')
    await openPO()
    fireEvent.click(choice('Item l1', 'Flag'))
    const save = screen.getByRole('button', { name: 'Save Flag' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/Describe the issue with this line/), {
      target: { value: '   ' },
    })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/Describe the issue with this line/), {
      target: { value: '  Price is too high ' },
    })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(mutation('SetPOLineAuditStatus')).toHaveBeenCalledWith({
      variables: {
        poId: 'po-1',
        lineId: 'l1',
        auditStatus: 'flagged',
        auditNote: 'Price is too high',
      },
    })
    // the box closes once it is saved
    expect(screen.queryByText(/Flag reason \(required\)/)).not.toBeInTheDocument()
  })

  it('Cancel closes the reason box and saves nothing', async () => {
    mockPO('finance_audit')
    await openPO()
    fireEvent.click(choice('Item l1', 'Flag'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/Flag reason \(required\)/)).not.toBeInTheDocument()
    expect(mutation('SetPOLineAuditStatus')).not.toHaveBeenCalled()
  })

  it('editing a flag starts from the reason that is already there', async () => {
    mockPO('finance_audit', {
      lines: [line('l1', { audit_status: 'flagged', audit_note: 'Wrong vendor' }), line('l2')],
    })
    await openPO()
    fireEvent.click(choice('Item l1', 'Flag'))
    expect(screen.getByPlaceholderText(/Describe the issue with this line/)).toHaveValue(
      'Wrong vendor',
    )
  })

  it('shows the reason of a flagged line in its row', async () => {
    mockPO('finance_audit', {
      lines: [line('l1', { audit_status: 'flagged', audit_note: 'Wrong vendor' }), line('l2')],
    })
    await openPO()
    expect(screen.getByText(/Wrong vendor/)).toBeInTheDocument()
    expect(choice('Item l1', 'Flag')).toHaveAttribute('aria-pressed', 'true')
  })

  it('both buttons wait while someone else holds the edit lock', async () => {
    lockedByOther = true
    mockPO('finance_audit')
    await openPO()
    expect(choice('Item l1', 'OK')).toBeDisabled()
    expect(choice('Item l1', 'Flag')).toBeDisabled()
  })

  it('is on a phone too, the two buttons sharing the card', async () => {
    setWidth(390)
    mockPO('finance_audit')
    await openPO()
    expect(choice('Item l1', 'OK')).toBeInTheDocument()
    expect(choice('Item l1', 'Flag')).toBeInTheDocument()
  })
})

describe('Finance review: the bar', () => {
  it('names the step and holds the two buttons, with the pass held back while lines are unchecked', async () => {
    mockPO('finance_audit')
    await openPO()
    expect(barTitle()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return for Correction' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Pass Audit (2 pending)' })).toBeDisabled()
  })

  it('says how many lines are checked and how many are flagged', async () => {
    mockPO('finance_audit', {
      lines: [
        line('l1', { audit_status: 'flagged', audit_note: 'x' }),
        line('l2', { audit_status: 'ok' }),
      ],
    })
    await openPO()
    expect(screen.getByText('Flagged: 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pass Audit (1 flagged)' })).toBeDisabled()
    // red once something is flagged, amber while lines are only waiting
    expect(lastText('Lines checked: 2 of 2')).toHaveStyle({ color: themes['light-flat'].danger })
  })

  it('the badge is amber while lines are only waiting to be checked', async () => {
    mockPO('finance_audit')
    await openPO()
    expect(lastText('Lines checked: 0 of 2')).toHaveStyle({ color: themes['light-flat'].warning })
    expect(screen.queryByText(/^Flagged:/)).not.toBeInTheDocument()
  })

  it('names the lines still to check before the flagged ones (that is what blocks the pass first)', async () => {
    mockPO('finance_audit', {
      lines: [line('l1', { audit_status: 'flagged', audit_note: 'x' }), line('l2')],
    })
    await openPO()
    expect(screen.getByRole('button', { name: 'Pass Audit (1 pending)' })).toBeDisabled()
  })

  it('with every line ok the badge is green and the audit can be passed', async () => {
    mockPO('finance_audit', {
      lines: [line('l1', { audit_status: 'ok' }), line('l2', { audit_status: 'ok' })],
    })
    await openPO()
    expect(screen.getByText('Every line is checked and OK')).toHaveStyle({
      color: themes['light-flat'].success,
    })
    const pass = screen.getByRole('button', { name: 'Pass Audit → Invoiced' })
    expect(pass).toBeEnabled()
    fireEvent.click(pass)
    expect(mutation('PassPOAudit')).toHaveBeenCalledWith({ variables: { id: 'po-1' } })
  })

  it('Return for Correction sends the order back', async () => {
    mockPO('finance_audit')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Return for Correction' }))
    expect(mutation('FailPOAudit')).toHaveBeenCalledWith({ variables: { id: 'po-1' } })
  })

  it('both buttons wait while someone else holds the edit lock', async () => {
    lockedByOther = true
    mockPO('finance_audit', {
      lines: [line('l1', { audit_status: 'ok' }), line('l2', { audit_status: 'ok' })],
    })
    await openPO()
    expect(screen.getByRole('button', { name: 'Return for Correction' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pass Audit → Invoiced' })).toBeDisabled()
  })
})

describe('Finance review: the receipts and photos window', () => {
  const photosButtons = () => screen.queryAllByRole('button', { name: 'Receipts & photos ↗' })

  it('has a button in the Lines card while the order is audited, so the pictures need no tab switch', async () => {
    mockPO('finance_audit')
    await openPO()
    expect(photosButtons()).toHaveLength(1)
  })

  it('is not offered to someone who may not audit (they have it on the Receipts tab)', async () => {
    mockPO('finance_audit', { callerIsFinanceTeam: false })
    await openPO()
    expect(photosButtons()).toHaveLength(0)
  })

  it('is not in the Lines card on other statuses', async () => {
    mockPO('goods_received')
    await openPO()
    expect(photosButtons()).toHaveLength(0)
  })
})

describe('Finance review: who audits', () => {
  it('the finance team audits', async () => {
    mockPO('finance_audit', { callerIsFinanceTeam: true })
    await openPO()
    expect(choice('Item l1', 'OK')).toBeInTheDocument()
  })

  it('a system-level user audits even when they are not on the finance team', async () => {
    systemLevel = true
    mockPO('finance_audit', { callerIsFinanceTeam: false })
    await openPO()
    expect(choice('Item l1', 'OK')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return for Correction' })).toBeInTheDocument()
  })

  it('anyone else sees the lines without controls, and a bar that only explains', async () => {
    mockPO('finance_audit', { callerIsFinanceTeam: false })
    await openPO()
    expect(screen.queryByRole('group', { name: /^Check:/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Lines checked: 0 of 2')).not.toBeInTheDocument()
    expect(barTitle()).toBeInTheDocument()
    expect(screen.getByText(i18n.t('po.detail.awaitingFinanceAudit'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Return for Correction' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pass Audit/ })).not.toBeInTheDocument()
    expect(nextStepCard()).not.toBeInTheDocument()
  })
})
