// The Advance page's list of PO lines waiting to be settled, and the GL account on each (playbook #91).
//
// A line carrying the header account `1000 Assets` made the first settlement on production die in the database as a bare
// "Failed to create settlement"; the page swallowed the error and the PO was closed so the account could not be changed. Now
// the list shows what is wrong with a line (the server says: missing, not postable, not this company's), holds such lines back
// from the selection, lets Finance (finance.ap.approve) change the account and cost center in place from postable accounts
// only, and shows the server's reason whenever a settlement or a change is refused. Renders the real page.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { useToastStore } from '../../../../store/toastStore'
import i18n from '../../../../i18n'

const apiGet = vi.fn()
const apiPost = vi.fn()
const apiPut = vi.fn()
vi.mock('../../../../lib/axios', () => ({
  api: {
    get: (...a: unknown[]): unknown => apiGet(...a),
    post: (...a: unknown[]): unknown => apiPost(...a),
    put: (...a: unknown[]): unknown => apiPut(...a),
  },
}))

let perms: Record<string, boolean> = {}
vi.mock('../../../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: (key: string) => !!perms[key],
    canAny: () => false,
    isSystemLevel: false,
  }),
}))

const advance = {
  id: 'adv-1',
  advance_number: 'ADV-0007',
  employee_name: 'Nadia Saleh',
  purpose: 'Site fuel',
  project_id: null,
  cost_center_id: null,
  amount: 10000000,
  settled_amount: 0,
  returned_amount: 0,
  outstanding_amount: 10000000,
  currency_code: 'IQD',
  status: 'approved',
  cash_account_id: 'cash-1',
  advance_account_id: 'adv-acc-1',
  notes: null,
  rejection_reason: null,
  void_reason: null,
  journal_entry_id: null,
  created_at: '2026-03-01T00:00:00Z',
  submitted_at: null,
  approved_at: null,
  issued_at: null,
  cashbox_name: null,
  project_code: null,
  project_name: null,
  can_revise: false,
  settlements: [],
  returns: [],
}

const line = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  description: `Item ${id}`,
  total_price: 5000,
  po_id: 'po-1',
  po_number: 'NY-PO-2026-0063',
  gl_account_id: 'acc-good',
  cost_center_id: 'cc-1',
  account_code: '3211',
  account_name: 'Construction Materials',
  account_problem: null,
  cost_center_code: 'CC1',
  cost_center_name: 'Site overhead',
  cost_center_problem: null,
  project_code: null,
  project_name: null,
  ...over,
})
const headerLine = (id: string, over: Record<string, unknown> = {}) =>
  line(id, {
    gl_account_id: 'acc-header',
    account_code: '1000',
    account_name: 'Assets',
    account_problem: 'not_postable',
    ...over,
  })

const POSTABLE = [
  { id: 'acc-good', code: '3211', name: 'Construction Materials' },
  { id: 'acc-tools', code: '3251', name: 'Small Tools Supplies' },
]
// What the page's own full-chart call (`?limit=500`) returns: the whole chart, with the header account a settlement cannot post to
// and an account that has been deactivated. The manual settlement form must not offer those.
const FULL_CHART = [
  { id: 'acc-header', code: '1000', name: 'Assets' },
  ...POSTABLE,
  { id: 'acc-old', code: '3299', name: 'Old account' },
]
const COST_CENTERS = [
  { id: 'cc-1', code: 'CC1', name: 'Site overhead', is_active: true },
  { id: 'cc-2', code: 'CC2', name: 'Workshop', is_active: true },
  { id: 'cc-old', code: 'CCOLD', name: 'Closed cost center', is_active: false },
]

let pending: Record<string, unknown>[] = []
async function openPage(
  lines: Record<string, unknown>[],
  settlements: Record<string, unknown>[] = [],
) {
  pending = lines
  apiGet.mockImplementation((url: string) => {
    if (url === '/finance/advances/adv-1')
      return Promise.resolve({ data: { ...advance, settlements } })
    if (url === '/finance/advances/adv-1/pending-po-lines')
      return Promise.resolve({ data: pending })
    if (url === '/finance/accounts?is_postable=true&is_active=true')
      return Promise.resolve({ data: POSTABLE })
    if (url.startsWith('/finance/accounts?')) return Promise.resolve({ data: FULL_CHART })
    if (url === '/finance/cost-centers') return Promise.resolve({ data: COST_CENTERS })
    if (url === '/projects') return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({ data: [] })
  })
  const { default: EmployeeAdvanceDetail } = await import('../EmployeeAdvanceDetail')
  render(
    <MemoryRouter initialEntries={['/finance/advances/adv-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/finance/advances/:id" element={<EmployeeAdvanceDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  await screen.findAllByText('ADV-0007')
  await waitFor(() => {
    expect(document.querySelector('tr[data-line-id]')).not.toBeNull()
  })
}

function row(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`tr[data-line-id="${id}"]`)
  if (!el) throw new Error(`no row for line ${id}`)
  return el
}
function checkbox(id: string): HTMLInputElement {
  const el = within(row(id)).getByRole('checkbox')
  if (!(el instanceof HTMLInputElement)) throw new Error('not an input')
  return el
}
const changeButton = (id: string) => within(row(id)).queryByRole('button', { name: 'Change' })
function clickChange(id: string) {
  const b = changeButton(id)
  if (!b) throw new Error(`no Change button on line ${id}`)
  fireEvent.click(b)
}
const toasts = () => useToastStore.getState().toasts.map((t) => `${t.variant}: ${t.message}`)
// the page also loads the full chart (`?limit=500`) for its manual settlement form; only the postable-only call is new
const postableCalls = () =>
  apiGet.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((u: string) => u.includes('is_postable'))

// A SearchableSelect: open it by clicking what it shows now, choose on mouseDown (its options use mouseDown, not click).
function openSelect(shown: string) {
  const el = screen.getAllByText(shown)
  fireEvent.click(el[el.length - 1])
}
const accountOptionTexts = () => screen.queryAllByText(/^\d{4} — /).map((e) => e.textContent)
const costCenterOptionTexts = () => screen.queryAllByText(/^CC\w* — /).map((e) => e.textContent)

beforeEach(() => {
  apiGet.mockReset()
  apiPost.mockReset().mockResolvedValue({ data: {} })
  apiPut.mockReset()
  perms = {
    'finance.advances.view': true,
    'finance.advances.edit': true,
    'finance.ap.approve': true,
  }
  useToastStore.setState({ toasts: [] })
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('what is wrong with a line is shown on it', () => {
  it('a header account, a missing account and a missing cost center each say so; a good line says nothing', async () => {
    await openPage([
      line('ok'),
      headerLine('hdr'),
      line('noacct', {
        gl_account_id: null,
        account_code: null,
        account_name: null,
        account_problem: 'missing',
      }),
      line('nocc', {
        cost_center_id: null,
        cost_center_code: null,
        cost_center_name: null,
        cost_center_problem: 'missing',
      }),
      line('foreign', { account_code: null, account_name: null, account_problem: 'not_found' }),
    ])
    expect(within(row('ok')).queryByTestId('account-problem')).toBeNull()
    expect(within(row('ok')).queryByTestId('cost-center-problem')).toBeNull()
    expect(within(row('hdr')).getByTestId('account-problem')).toHaveTextContent(
      'Header account: it cannot be posted to',
    )
    expect(within(row('hdr')).getByText('1000 · Assets')).toBeInTheDocument() // the account is still named
    expect(within(row('noacct')).getByTestId('account-problem')).toHaveTextContent('No GL account')
    expect(within(row('nocc')).getByTestId('cost-center-problem')).toHaveTextContent(
      'No cost center',
    )
    expect(within(row('foreign')).getByTestId('account-problem')).toHaveTextContent(
      "Not one of this company's accounts",
    )
  })

  it('a note above the list says some lines need fixing, and only when one does', async () => {
    await openPage([line('ok'), headerLine('hdr')])
    expect(screen.getByRole('note')).toHaveTextContent(
      /need a postable GL account and a cost center/,
    )
  })

  it('no note when every line is fine', async () => {
    await openPage([line('a'), line('b')])
    expect(screen.queryByRole('note')).toBeNull()
  })
})

describe('a line that cannot be posted cannot be ticked', () => {
  it('its box is disabled with the reason, and clicking the row does not select it', async () => {
    await openPage([line('ok'), headerLine('hdr')])
    const box = checkbox('hdr')
    expect(box).toBeDisabled()
    expect(box).toHaveAttribute('title', "Fix this line's account before it can be settled")
    fireEvent.click(row('hdr'))
    expect(box).not.toBeChecked()
    expect(screen.getByText(/0 selected/)).toBeInTheDocument()
    expect(checkbox('ok')).toBeEnabled()
  })

  it('a good line can be ticked, and settling sends only the ticked good lines', async () => {
    await openPage([line('ok'), line('ok2'), headerLine('hdr')])
    fireEvent.click(checkbox('ok'))
    fireEvent.click(checkbox('ok2'))
    fireEvent.click(row('hdr'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Settlement from Selected' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/finance/advances/settlements', {
        advance_id: 'adv-1',
        po_line_ids: ['ok', 'ok2'],
      })
    })
  })
})

describe('a refused settlement says why (it used to be swallowed)', () => {
  it("shows the server's sentence, keeps the selection, and does not reload over it", async () => {
    apiPost.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'LINES_NEED_ACCOUNTING',
            message:
              '1 selected line cannot be settled yet: NY-PO-2026-0063 line 1 (Item ok): has no GL account.',
          },
        },
      },
    })
    await openPage([line('ok')])
    fireEvent.click(checkbox('ok'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Settlement from Selected' }))
    await waitFor(() => {
      expect(toasts()).toContain(
        'danger: 1 selected line cannot be settled yet: NY-PO-2026-0063 line 1 (Item ok): has no GL account.',
      )
    })
    expect(checkbox('ok')).toBeChecked()
  })

  it('falls back to a plain message when the failure carries none', async () => {
    apiPost.mockRejectedValue(new Error('Network Error'))
    await openPage([line('ok')])
    fireEvent.click(checkbox('ok'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Settlement from Selected' }))
    await waitFor(() => {
      expect(toasts()).toContain('danger: Could not create the settlement')
    })
  })
})

describe('a line with no cost center is held back like one with a bad account', () => {
  it('its box is disabled and the row cannot be ticked', async () => {
    await openPage([
      line('nocc', {
        cost_center_id: null,
        cost_center_code: null,
        cost_center_name: null,
        cost_center_problem: 'missing',
      }),
    ])
    expect(checkbox('nocc')).toBeDisabled()
    fireEvent.click(row('nocc'))
    expect(checkbox('nocc')).not.toBeChecked()
  })
})

describe('the manual settlement form shows a refusal too', () => {
  it("keeps the form open and shows the server's reason when the settlement is refused", async () => {
    apiPost.mockRejectedValue({
      response: {
        data: { error: { code: 'INTERNAL_ERROR', message: 'The settlement could not be saved' } },
      },
    })
    await openPage([line('ok')])
    fireEvent.click(screen.getByRole('button', { name: '+ New Settlement' }))
    await screen.findByText('New Settlement')
    const selectWith = (optionName: string): HTMLSelectElement => {
      const option = screen.getByRole('option', { name: optionName })
      const select = option.closest('select')
      if (!select) throw new Error(`no select holds ${optionName}`)
      return select
    }
    fireEvent.change(selectWith('3211 · Construction Materials'), { target: { value: 'acc-good' } })
    fireEvent.change(selectWith('CC1 · Site overhead'), { target: { value: 'cc-1' } })
    fireEvent.change(screen.getByPlaceholderText('What was this for?'), {
      target: { value: 'Diesel' },
    })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Settlement' }))
    await waitFor(() => {
      expect(toasts()).toContain('danger: The settlement could not be saved')
    })
    expect(screen.getByRole('button', { name: 'Create Settlement' })).toBeEnabled() // still open, nothing lost
    expect(screen.getByPlaceholderText('What was this for?')).toHaveValue('Diesel')
  })
})

describe('the manual settlement form offers only accounts it can post to', () => {
  const openForm = async () => {
    fireEvent.click(screen.getByRole('button', { name: '+ New Settlement' }))
    await screen.findByText('New Settlement')
  }
  const optionsOfSelectHolding = (optionName: string): string[] => {
    const select = screen.getByRole('option', { name: optionName }).closest('select')
    if (!select) throw new Error(`no select holds ${optionName}`)
    return within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
  }

  it('lists the postable accounts and not the header account the whole chart contains', async () => {
    await openPage([line('ok')])
    await openForm()
    expect(optionsOfSelectHolding('3211 · Construction Materials')).toEqual([
      '— Account —',
      '3211 · Construction Materials',
      '3251 · Small Tools Supplies',
    ])
    expect(screen.queryByRole('option', { name: '1000 · Assets' })).toBeNull()
    expect(screen.queryByRole('option', { name: '3299 · Old account' })).toBeNull()
  })

  it('an advances editor who does not hold finance.ap.approve gets the same list', async () => {
    perms = { 'finance.advances.view': true, 'finance.advances.edit': true }
    await openPage([line('ok')])
    await openForm()
    expect(screen.queryByRole('option', { name: '1000 · Assets' })).toBeNull()
    expect(screen.getByRole('option', { name: '3251 · Small Tools Supplies' })).toBeInTheDocument()
  })

  it('hides an inactive cost center', async () => {
    await openPage([line('ok')])
    await openForm()
    const texts = optionsOfSelectHolding('CC2 · Workshop')
    expect(texts).toEqual(['— Required —', 'CC1 · Site overhead', 'CC2 · Workshop'])
  })
})

describe('approving a manual settlement shows the server’s reason (it used to be swallowed)', () => {
  const submitted = {
    id: 'set-1',
    settlement_number: 'SET-0001',
    settlement_date: '2026-11-15',
    description: 'Diesel',
    total_amount: 4000,
    currency_code: 'IQD',
    status: 'submitted',
    line_count: 1,
    rejection_reason: null,
  }
  const approveButton = () => screen.getByRole('button', { name: 'Approve' })

  it('shows the sentence, and the settlement stays as it was', async () => {
    perms = { ...perms, 'finance.advances.approve': true }
    apiPost.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'LINES_NEED_ACCOUNTING',
            message:
              '1 line cannot be posted: Line 1 (Diesel): GL account 1000 · Assets is a header account and cannot be posted to.',
          },
        },
      },
    })
    await openPage([line('ok')], [submitted])
    fireEvent.click(approveButton())
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/finance/advances/settlements/set-1/approve', {})
    })
    await waitFor(() => {
      expect(toasts()).toContain(
        'danger: 1 line cannot be posted: Line 1 (Diesel): GL account 1000 · Assets is a header account and cannot be posted to.',
      )
    })
    expect(approveButton()).toBeInTheDocument()
  })

  it('falls back to the page’s plain message when the failure carries none', async () => {
    perms = { ...perms, 'finance.advances.approve': true }
    apiPost.mockRejectedValue(new Error('Network Error'))
    await openPage([line('ok')], [submitted])
    fireEvent.click(approveButton())
    await waitFor(() => {
      expect(toasts()).toContain(`danger: ${i18n.t('fin.advRequest.actionFailed')}`)
    })
  })

  it('a successful approval shows no error', async () => {
    perms = { ...perms, 'finance.advances.approve': true }
    await openPage([line('ok')], [submitted])
    fireEvent.click(approveButton())
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/finance/advances/settlements/set-1/approve', {})
    })
    expect(toasts().filter((x) => x.startsWith('danger'))).toEqual([])
  })
})

describe('who sees Change', () => {
  it('someone holding finance.ap.approve sees it on every pending line, and the postable accounts are fetched', async () => {
    await openPage([line('ok'), headerLine('hdr')])
    expect(changeButton('ok')).toBeInTheDocument()
    expect(changeButton('hdr')).toBeInTheDocument()
    expect(postableCalls()).toEqual(['/finance/accounts?is_postable=true&is_active=true'])
  })

  it('an advances editor without finance.ap.approve does not see it, but still gets the postable list for the manual form', async () => {
    perms = { 'finance.advances.view': true, 'finance.advances.edit': true }
    await openPage([headerLine('hdr')])
    expect(changeButton('hdr')).toBeNull()
    expect(postableCalls()).toEqual(['/finance/accounts?is_postable=true&is_active=true'])
    expect(within(row('hdr')).getByTestId('account-problem')).toBeInTheDocument() // they still see what is wrong
  })

  it('someone who can neither classify nor edit fetches nothing extra', async () => {
    perms = { 'finance.advances.view': true }
    await openPage([headerLine('hdr')])
    expect(changeButton('hdr')).toBeNull()
    expect(postableCalls()).toEqual([])
  })
})

describe('changing the account of a line', () => {
  it('opens an editor that starts empty for a header account, but keeps the cost center, and waits for both', async () => {
    await openPage([headerLine('hdr')])
    clickChange('hdr')
    expect(screen.getByText('Search postable accounts')).toBeInTheDocument() // account: nothing chosen
    expect(screen.getByText('CC1 — Site overhead')).toBeInTheDocument() // cost center: the line's own
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('starts the cost center empty as well when the line’s own is not one of this company’s (its id is never offered back)', async () => {
    await openPage([
      line('fcc', {
        cost_center_id: 'cc-foreign',
        cost_center_code: null,
        cost_center_name: null,
        cost_center_problem: 'not_found',
      }),
    ])
    clickChange('fcc')
    expect(screen.getByText('Search cost centers')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('starts from the line’s own account and cost center when they are fine', async () => {
    await openPage([line('ok')])
    clickChange('ok')
    expect(screen.getAllByText('3211 — Construction Materials').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('offers only the postable accounts the server sent, and never an inactive cost center', async () => {
    await openPage([headerLine('hdr')])
    clickChange('hdr')
    openSelect('Search postable accounts')
    expect(accountOptionTexts()).toEqual([
      '3211 — Construction Materials',
      '3251 — Small Tools Supplies',
    ])
    expect(screen.queryByText(/1000 — Assets/)).toBeNull()
  })

  it('the cost center list hides an inactive one', async () => {
    await openPage([line('ok')])
    clickChange('ok')
    openSelect('CC1 — Site overhead')
    const texts = costCenterOptionTexts()
    expect(texts).toContain('CC2 — Workshop')
    expect(texts.some((x) => x.startsWith('CCOLD'))).toBe(false)
  })

  it('saving sends both ids to the line, updates the row in place (no longer flagged, tickable) and says so', async () => {
    apiPut.mockResolvedValue({
      data: line('hdr', {
        gl_account_id: 'acc-tools',
        account_code: '3251',
        account_name: 'Small Tools Supplies',
      }),
    })
    await openPage([headerLine('hdr')])
    clickChange('hdr')
    openSelect('Search postable accounts')
    fireEvent.mouseDown(screen.getByText('3251 — Small Tools Supplies'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith('/finance/advances/adv-1/po-lines/hdr/accounting', {
        gl_account_id: 'acc-tools',
        cost_center_id: 'cc-1',
      })
    })
    await waitFor(() => {
      expect(within(row('hdr')).queryByTestId('account-problem')).toBeNull()
    })
    expect(within(row('hdr')).getByText('3251 · Small Tools Supplies')).toBeInTheDocument()
    expect(checkbox('hdr')).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull() // the editor closed
    expect(screen.queryByRole('note')).toBeNull() // nothing left to fix
    expect(toasts()).toContain('success: Account updated')
    expect(
      apiGet.mock.calls.filter(
        (c: unknown[]) => c[0] === '/finance/advances/adv-1/pending-po-lines',
      ),
    ).toHaveLength(1) // no reload needed
  })

  it("a refused change shows the server's reason, keeps the editor open with what was chosen, and leaves the line as it was", async () => {
    apiPut.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'ACCOUNT_NOT_POSTABLE',
            message:
              '1000 · Assets is a header account and cannot be posted to: choose a postable account',
          },
        },
      },
    })
    await openPage([headerLine('hdr')])
    clickChange('hdr')
    openSelect('Search postable accounts')
    fireEvent.mouseDown(screen.getByText('3251 — Small Tools Supplies'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(toasts()).toContain(
        'danger: 1000 · Assets is a header account and cannot be posted to: choose a postable account',
      )
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled() // still open
    expect(screen.getAllByText('3251 — Small Tools Supplies').length).toBeGreaterThan(0) // the choice is kept
    expect(within(row('hdr')).getByTestId('account-problem')).toBeInTheDocument() // the line is unchanged
  })

  it('falls back to a plain message when the failure carries none', async () => {
    apiPut.mockRejectedValue(new Error('Network Error'))
    await openPage([line('ok')])
    clickChange('ok')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(toasts()).toContain('danger: Could not change the account')
    })
  })

  it('Cancel closes the editor and sends nothing', async () => {
    await openPage([headerLine('hdr')])
    clickChange('hdr')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(apiPut).not.toHaveBeenCalled()
  })

  it('only one editor is open at a time: opening another line moves it', async () => {
    await openPage([headerLine('a'), headerLine('b')])
    clickChange('a')
    clickChange('b')
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1)
    expect(row('b').nextElementSibling).toContainElement(
      screen.getByRole('button', { name: 'Save' }),
    )
  })

  it('clicking Change does not tick the line', async () => {
    await openPage([line('ok')])
    clickChange('ok')
    expect(checkbox('ok')).not.toBeChecked()
  })
})

describe('in Arabic', () => {
  it('every new string has its own text, none is a raw key', async () => {
    await i18n.changeLanguage('ar')
    await openPage([headerLine('hdr')])
    expect(within(row('hdr')).getByTestId('account-problem')).toHaveTextContent(
      i18n.t('fin.advDetail.accountProblemNotPostable'),
    )
    expect(screen.getByRole('note')).toHaveTextContent(i18n.t('fin.advDetail.linesNeedAccounting'))
    fireEvent.click(
      within(row('hdr')).getByRole('button', { name: i18n.t('fin.advDetail.accountingChange') }),
    )
    expect(
      screen.getByRole('button', { name: i18n.t('fin.advDetail.accountingSave') }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(
      /fin\.advDetail\.(accounting|accountProblem|costCenterProblem|lineNeedsFixing|linesNeedAccounting|searchPostableAccounts|searchCostCenters|couldNotCreateSettlement)/,
    )
  })
})
