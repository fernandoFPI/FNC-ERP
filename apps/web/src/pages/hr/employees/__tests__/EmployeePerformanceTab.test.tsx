// The employee Performance tab: what each tile and section says for a known set of figures, the period switch, the click-through to which
// requisitions were sent back, the no-login and error states, and English and Arabic (no raw key may ever show).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import { EmployeePerformanceTab } from '../EmployeePerformanceTab'

const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    gql: actual.gql,
  }
})

const must = <T,>(x: T | null | undefined): T => {
  if (x == null) throw new Error('expected the element to exist')
  return x
}

function perf(over: Record<string, unknown> = {}) {
  return {
    employeeId: 'e1',
    linked: true,
    days: 90,
    since: '2026-08-30T00:00:00.000Z',
    requisitions: { organized: 31, completed: 19, inProgress: 8, cancelled: 4, sentBack: 9 },
    sentBackStages: [
      {
        key: 'draft',
        count: 1,
        examples: [{ number: 'NY-REQ-2026-0180', note: 'missing project' }],
      },
      { key: 'inventory_check', count: 0, examples: [] },
      { key: 'store_pricing', count: 0, examples: [] },
      {
        key: 'market_pricing',
        count: 3,
        examples: [
          { number: 'NY-REQ-2026-0211', note: 'market price far above store price' },
          { number: 'NY-REQ-2026-0169', note: null },
        ],
      },
      {
        key: 'organizer_review',
        count: 2,
        examples: [{ number: 'NY-REQ-2026-0183', note: 'purchase price changed' }],
      },
      { key: 'finance_return', count: 0, examples: [] },
    ],
    workSentBack: [
      { key: 'pricing_rejected', count: 4 },
      { key: 'verification_rejected', count: 2 },
      { key: 'review_rejected', count: 1 },
      { key: 'over_tolerance', count: 6 },
      { key: 'lines_flagged', count: 11 },
      { key: 'audit_returned', count: 7 },
    ],
    trend: [
      { month: '2026-09', total: 10, sentBack: 4 },
      { month: '2026-10', total: 12, sentBack: 3 },
      { month: '2026-11', total: 9, sentBack: 2 },
    ],
    audit: { passedFirst: 21, returned: 4, passedAfterReturn: 3 },
    claims: [
      { key: 'expense_claim', filed: 11, rejected: 2 },
      { key: 'advance_request', filed: 3, rejected: 0 },
    ],
    approver: [],
    ...over,
  }
}

const refetch = vi.fn()
function answer(p: unknown, extra: Record<string, unknown> = {}) {
  mockUseQuery.mockImplementation(() => ({
    data: p === undefined ? undefined : { employeePerformance: p },
    loading: false,
    error: undefined,
    refetch,
    ...extra,
  }))
}
const renderTab = () =>
  render(
    <ThemeProvider>
      <EmployeePerformanceTab employeeId="e1" />
    </ThemeProvider>,
  )
const variablesOfLastCall = () =>
  (
    (mockUseQuery.mock.calls.at(-1) as unknown[] | undefined)?.[1] as {
      variables: { employeeId: string; days: number | null }
    }
  ).variables

beforeEach(async () => {
  mockUseQuery.mockReset()
  refetch.mockReset()
  await i18n.changeLanguage('en')
})
afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

describe('the figures', () => {
  it('shows each tile with its rate beside its count', () => {
    answer(perf())
    renderTab()
    const tile = (name: string) => must(screen.getByText(name).parentElement)
    expect(within(tile('Requisitions organized')).getByText('31')).toBeTruthy()
    expect(
      within(tile('Requisitions organized')).getByText(
        '19 completed · 8 in progress · 4 cancelled',
      ),
    ).toBeTruthy()
    expect(within(tile('Sent back at least once')).getByText('29%')).toBeTruthy()
    expect(within(tile('Sent back at least once')).getByText('9 of 31 requisitions')).toBeTruthy()
    expect(within(tile('Finance audit passed first time')).getByText('75%')).toBeTruthy()
    expect(
      within(tile('Finance audit passed first time')).getByText('21 of 28 purchase orders'),
    ).toBeTruthy()
    expect(within(tile('Expense claims rejected')).getByText('18%')).toBeTruthy()
    expect(within(tile('Expense claims rejected')).getByText('2 of 11 claims')).toBeTruthy()
  })

  it('shows a dash, never 0 %, where there is nothing to divide by', () => {
    answer(
      perf({
        requisitions: { organized: 0, completed: 0, inProgress: 0, cancelled: 0, sentBack: 0 },
        audit: { passedFirst: 0, returned: 0, passedAfterReturn: 0 },
        claims: [
          { key: 'expense_claim', filed: 0, rejected: 0 },
          { key: 'advance_request', filed: 0, rejected: 0 },
        ],
      }),
    )
    renderTab()
    expect(must(screen.getByText('Sent back at least once').parentElement).textContent).toContain(
      '—',
    )
    expect(
      must(screen.getByText('Finance audit passed first time').parentElement).textContent,
    ).toContain('—')
    expect(
      must(screen.getByText('Expense claims rejected').parentElement).textContent,
    ).not.toContain('0%')
  })

  it('lists where requisitions were sent back and what work of theirs was sent back', () => {
    answer(perf())
    renderTab()
    for (const name of [
      'Back to draft',
      'Inventory check',
      'Store pricing',
      'Market pricing',
      'Organizer review (rejected at re-approval)',
      'Returned by Finance',
    ]) {
      expect(screen.getByText(name)).toBeTruthy()
    }
    for (const name of [
      'Market pricing sent back at price verification',
      'Price verification sent back at approval',
      'Review sent back at re-approval',
      'Purchases over the approved price',
      'Lines flagged by an approver',
      'Purchase orders Finance returned',
    ]) {
      expect(screen.getByText(name)).toBeTruthy()
    }
    expect(
      must(screen.getByText('Lines flagged by an approver').parentElement).textContent,
    ).toContain('11')
  })

  it('shows the audit results and the claims table', () => {
    answer(perf())
    renderTab()
    const auditRow = (name: string) => must(screen.getByText(name).closest('tr'))
    expect(auditRow('Passed first time').textContent).toContain('21')
    expect(auditRow('Passed first time').textContent).toContain('75%')
    expect(auditRow('Returned for correction').textContent).toContain('14%')
    expect(auditRow('Passed after a return').textContent).toContain('11%')
    const claimRow = (name: string) => must(screen.getByText(name).closest('tr'))
    expect(claimRow('Expense claims').textContent).toContain('18%')
    expect(claimRow('Advance requests').textContent).toContain('0%')
  })

  it('draws each month with its share and its count, named for a screen reader', () => {
    answer(perf())
    renderTab()
    const bars = screen.getAllByRole('img')
    expect(bars).toHaveLength(3)
    expect(must(bars[0]).getAttribute('aria-label')).toMatch(
      /4 of 10 requisitions sent back \(40%\)/,
    )
    expect(must(bars[0]).textContent).toContain('4/10')
    expect(must(bars[2]).getAttribute('aria-label')).toMatch(
      /2 of 9 requisitions sent back \(22%\)/,
    )
  })
})

describe('click-through to the requisitions behind a count', () => {
  it('opens the list with the reason, shows a placeholder when none was written, and closes again', () => {
    answer(perf())
    renderTab()
    const row = screen.getByRole('button', { name: /Market pricing/ })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Sent back here, newest first')).toBeTruthy()
    expect(screen.getByText('NY-REQ-2026-0211')).toBeTruthy()
    expect(screen.getByText(': market price far above store price')).toBeTruthy()
    expect(screen.getByText(': no reason written')).toBeTruthy()
    fireEvent.click(row)
    expect(screen.queryByText('NY-REQ-2026-0211')).toBeNull()
  })

  it('opens one at a time, and a row with nothing behind it is not a button', () => {
    answer(perf())
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /Market pricing/ }))
    fireEvent.click(screen.getByRole('button', { name: /Back to draft/ }))
    expect(screen.getByText('NY-REQ-2026-0180')).toBeTruthy()
    expect(screen.queryByText('NY-REQ-2026-0211')).toBeNull()
    expect(screen.queryByRole('button', { name: /Inventory check/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Lines flagged/ })).toBeNull()
  })
})

describe('the period switch', () => {
  it('starts on 90 days and asks the server for the period that was chosen', () => {
    answer(perf())
    renderTab()
    expect(variablesOfLastCall()).toEqual({ employeeId: 'e1', days: 90 })
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed')
    expect(pressed('90 days')).toBe('true')
    expect(pressed('30 days')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    expect(variablesOfLastCall()).toEqual({ employeeId: 'e1', days: 30 })
    fireEvent.click(screen.getByRole('button', { name: '1 year' }))
    expect(variablesOfLastCall().days).toBe(365)
    fireEvent.click(screen.getByRole('button', { name: 'All time' }))
    expect(variablesOfLastCall().days).toBeNull()
    expect(screen.getByRole('button', { name: 'All time' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByRole('button', { name: '90 days' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('says which period the figures are for, and closes an open list when the period changes', () => {
    answer(perf())
    renderTab()
    expect(
      screen.getByText(
        /Last 90 days · requisition figures count only requisitions this person organized/,
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Market pricing/ }))
    expect(screen.getByText('NY-REQ-2026-0211')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '1 year' }))
    expect(screen.queryByText('NY-REQ-2026-0211')).toBeNull()
    expect(screen.getByText(/Last 12 months/)).toBeTruthy()
  })
})

describe('someone who approves things', () => {
  it('shows the section and the median tile only when they decided something', () => {
    answer(perf())
    renderTab()
    expect(screen.queryByText('As an approver')).toBeNull()
    expect(screen.queryByText('Median time to answer')).toBeNull()
    cleanup()
    answer(
      perf({
        approver: [
          { key: 'requisition', approved: 46, sentBack: 6, medianHours: 3 },
          { key: 'expense_claim', approved: 19, sentBack: 3, medianHours: 60 },
        ],
      }),
    )
    renderTab()
    expect(screen.getByText('As an approver')).toBeTruthy()
    const tile = must(screen.getByText('Median time to answer', { selector: 'div' }).parentElement)
    expect(tile.textContent).toContain('3 h')
    expect(tile.textContent).toContain('as an approver, Requisitions')
    const claimRow = must(
      screen
        .getAllByText('Expense claims')
        .map((e) => e.closest('tr'))
        .find((r) => r?.textContent.includes('19')),
    )
    expect(claimRow.textContent).toContain('2.5 d')
  })
})

describe('the states around the figures', () => {
  it('says so when the employee has no login, and still shows the rest', () => {
    answer(perf({ linked: false }))
    renderTab()
    expect(screen.getByRole('note').textContent).toMatch(/not linked to a login/)
    expect(screen.getByText('Expense claims and advances')).toBeTruthy()
  })

  it('has no such note for a linked employee', () => {
    answer(perf())
    renderTab()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('shows a loading line while nothing has arrived', () => {
    answer(undefined, { loading: true })
    renderTab()
    expect(screen.getByText('Loading performance figures…')).toBeTruthy()
  })

  it('says it is not available when the server returned nothing', () => {
    answer(null)
    renderTab()
    expect(
      screen.getByText('Performance figures are not available for this employee.'),
    ).toBeTruthy()
  })

  it('shows the failure with a way to try again', () => {
    answer(undefined, { error: new Error('boom') })
    renderTab()
    expect(screen.getByRole('alert').textContent).toBe(
      'The performance figures could not be loaded.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the last figures when a refresh fails', () => {
    answer(perf(), { error: new Error('boom') })
    renderTab()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Requisitions organized')).toBeTruthy()
  })
})

describe('Arabic', () => {
  it('shows no raw key, reads right to left in the table headers and keeps every figure', async () => {
    await i18n.changeLanguage('ar')
    answer(perf({ approver: [{ key: 'requisition', approved: 5, sentBack: 1, medianHours: 3 }] }))
    const { container } = renderTab()
    expect(container.textContent).not.toMatch(/hr\.performance|\{\{/)
    expect(screen.getByText('الأداء')).toBeTruthy()
    expect(screen.getByRole('button', { name: '30 يومًا' })).toBeTruthy()
    expect(screen.getByText('الوسيط لزمن الرد', { selector: 'div' })).toBeTruthy()
    expect(container.textContent).toContain('75%')
    fireEvent.click(screen.getByRole('button', { name: /تسعير السوق/ }))
    expect(screen.getByText('NY-REQ-2026-0211')).toBeTruthy()
  })
})

describe('every text the tab can show exists in both languages', () => {
  const root = path.resolve(__dirname, '../../../../')
  const read = (p: string): string => readFileSync(path.resolve(root, p), 'utf8')
  const en = JSON.parse(read('i18n/locales/en.json')) as {
    hr: { performance: Record<string, unknown>; empDetail: Record<string, string> }
    perm: { reg: Record<string, string> }
  }
  const ar = JSON.parse(read('i18n/locales/ar.json')) as typeof en
  const source = read('pages/hr/employees/EmployeePerformanceTab.tsx')
  const server = readFileSync(
    path.resolve(root, '../../../services/gateway/src/lib/employeePerformance.ts'),
    'utf8',
  )

  const fixed = [...source.matchAll(/hr\.performance\.([A-Za-z0-9_]+)['"`]/g)].map((m) => m[1])
  const fromServer = (name: string): string[] => {
    const m = new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(server)
    return [...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
  }

  it.each([
    ['en', en],
    ['ar', ar],
  ] as const)('%s has every fixed key', (_lang, file) => {
    expect(fixed.length).toBeGreaterThan(30)
    for (const k of fixed) {
      if (['stage', 'work', 'claim', 'approverKind'].includes(k)) continue
      expect(typeof file.hr.performance[k], `hr.performance.${k}`).toBe('string')
    }
    expect(typeof file.hr.empDetail.performance).toBe('string')
    expect(typeof file.perm.reg.viewEmployeePerformance).toBe('string')
  })

  it.each([
    ['en', en],
    ['ar', ar],
  ] as const)(
    '%s names every stage, kind of work, claim and approval kind the server can send',
    (_lang, file) => {
      const stages = fromServer('SEND_BACK_STAGE_ORDER')
      const works = fromServer('WORK_KEY_ORDER')
      expect(stages.length).toBe(6)
      expect(works.length).toBe(6)
      const group = (g: string) => file.hr.performance[g] as Record<string, string>
      for (const k of stages) expect(typeof group('stage')[k], `stage.${k}`).toBe('string')
      for (const k of works) expect(typeof group('work')[k], `work.${k}`).toBe('string')
      for (const k of ['expense_claim', 'advance_request'])
        expect(typeof group('claim')[k], `claim.${k}`).toBe('string')
      for (const k of ['requisition', 'expense_claim', 'advance_request'])
        expect(typeof group('approverKind')[k], `approverKind.${k}`).toBe('string')
    },
  )

  it('has the same keys in English and Arabic', () => {
    const flat = (o: Record<string, unknown>, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? flat(v as Record<string, unknown>, `${p}${k}.`)
          : [`${p}${k}`],
      )
    expect(flat(ar.hr.performance).sort()).toEqual(flat(en.hr.performance).sort())
  })

  it('keeps every {{value}} the English text has, in Arabic too', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
    const flat = (o: Record<string, unknown>, p = ''): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? flat(v as Record<string, unknown>, `${p}${k}.`)
          : ([[`${p}${k}`, String(v)]] as [string, string][]),
      )
    const arMap = new Map(flat(ar.hr.performance))
    for (const [k, v] of flat(en.hr.performance))
      expect(vars(arMap.get(k) ?? ''), k).toEqual(vars(v))
  })
})
