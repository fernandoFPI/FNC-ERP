// The Petty Cash page and a float's currency (playbook #89).
//
// The New Float form had no currency box and sent a hard-coded IQD, there was no way to edit a float, and the three
// summary cards added every float into one number labelled IQD. Two USD floats on production were stored as IQD with no
// way to fix them. Now: the form asks for the currency, an Edit Float dialog can correct it while the float only holds
// its opening balance (the server is the authority and refuses afterwards, and the page says why), and the totals are one
// figure per currency.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { useToastStore } from '../../../../store/toastStore'

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

interface FloatRow {
  id: string
  name: string
  currency_code: string
  current_balance: number
  authorized_limit: number
  is_active: boolean
  gl_account_id: string | null
  custodian_employee_id: string | null
  custodian_display_name: string | null
  account_code: string | null
  account_name: string | null
  location: string | null
  custodian_name: string | null
  pct_remaining: number | null
  notes: string | null
  has_activity?: boolean
}

const floatRow = (over: Partial<FloatRow> = {}): FloatRow => ({
  id: 'f-1',
  name: 'Main Cash USD',
  currency_code: 'IQD', // created as IQD by the old form
  current_balance: 194337.94,
  authorized_limit: 194337.94,
  is_active: true,
  gl_account_id: 'gl-1',
  custodian_employee_id: null,
  custodian_display_name: null,
  account_code: '1211',
  account_name: 'Main Cashbox',
  location: null,
  custodian_name: null,
  pct_remaining: 100,
  notes: null,
  has_activity: false,
  ...over,
})

let floats: FloatRow[] = []
const CASH = [{ id: 'gl-1', code: '1211', name: 'Main Cashbox' }]
const EMPLOYEES = [{ id: 'emp-1', first_name: 'Hana', last_name: 'Karim' }]

function wireApi() {
  apiGet.mockImplementation((url: string) => {
    if (url === '/finance/petty-cash/floats') return Promise.resolve({ data: floats })
    const detail = /^\/finance\/petty-cash\/floats\/(.+)$/.exec(url)
    if (detail) {
      const f = floats.find((x) => x.id === detail[1])
      return Promise.resolve({ data: { ...f, transactions: [], replenishments: [] } })
    }
    if (url.startsWith('/finance/accounts?category=CASH&')) return Promise.resolve({ data: CASH })
    if (url.startsWith('/hr/employees')) return Promise.resolve({ data: EMPLOYEES })
    return Promise.resolve({ data: [] })
  })
}

async function openPage() {
  wireApi()
  const { default: PettyCashPage } = await import('../PettyCashPage')
  render(
    <MemoryRouter>
      <ThemeProvider>
        <PettyCashPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
  await screen.findByText('Floats')
}

// the page's labels and its controls are siblings inside one div (not linked by htmlFor in the older form)
function controlUnder(
  label: string | RegExp,
  scope: HTMLElement = document.body,
): HTMLInputElement | HTMLSelectElement {
  const labelEl = within(scope).getByText(label)
  const control = labelEl.parentElement?.querySelector('input, select, textarea')
  if (!control) throw new Error(`no control under the label ${String(label)}`)
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement))
    throw new Error('unexpected control')
  return control
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const toasts = () => useToastStore.getState().toasts.map((t) => t.message)

async function selectFloat(name: string) {
  fireEvent.click(await screen.findByText(name))
  await screen.findByText('Recent Transactions')
}

beforeEach(() => {
  vi.clearAllMocks()
  useToastStore.setState({ toasts: [] })
  perms = { 'finance.petty_cash.edit': true, 'finance.petty_cash.view': true }
  floats = [
    floatRow({ id: 'f-1', name: 'Main Cash USD' }),
    floatRow({
      id: 'f-2',
      name: 'Main Cach IQD',
      current_balance: 58603502,
      authorized_limit: 68603502,
      has_activity: true,
    }),
  ]
})

describe('summary cards: one figure per currency', () => {
  it('shows the IQD floats and the USD float apart, never one added number', async () => {
    floats = [floatRow({ id: 'f-1', name: 'Main Cash USD', currency_code: 'USD' }), floats[1]]
    await openPage()
    const held = screen.getByTestId('total-held')
    expect(held).toHaveTextContent('58,603,502 IQD')
    expect(held).toHaveTextContent('194,337.94 USD')
    expect(held).not.toHaveTextContent('58,797,839.94')
    const authorized = screen.getByTestId('total-authorized')
    expect(authorized).toHaveTextContent('68,603,502 IQD')
    expect(authorized).toHaveTextContent('194,337.94 USD')
  })

  it('names the currency on each utilization figure once there is more than one', async () => {
    floats = [floatRow({ id: 'f-1', name: 'Main Cash USD', currency_code: 'USD' }), floats[1]]
    await openPage()
    const utilization = screen.getByTestId('total-utilization')
    expect(utilization).toHaveTextContent('IQD 15%')
    expect(utilization).toHaveTextContent('USD 0%')
  })

  it('keeps the plain look with a single currency: one amount, a bare percentage', async () => {
    floats = [floats[1]]
    await openPage()
    expect(screen.getByTestId('total-held')).toHaveTextContent(/^58,603,502\s*IQD$/)
    expect(screen.getByTestId('total-utilization')).toHaveTextContent(/^15%$/)
  })

  it('still shows a zero in IQD when there are no floats', async () => {
    floats = []
    await openPage()
    expect(screen.getByTestId('total-held')).toHaveTextContent(/^0\s*IQD$/)
  })
})

describe('New Float: the currency is asked for', () => {
  async function fillNewFloat(currency: string | null) {
    await openPage()
    click(/new float/i)
    fireEvent.change(screen.getByPlaceholderText('e.g. Head Office Petty Cash'), {
      target: { value: 'Site cash' },
    })
    fireEvent.change(controlUnder('Cashbox (GL Account) *'), { target: { value: 'gl-1' } })
    fireEvent.change(controlUnder('Authorized Limit *'), { target: { value: '5000' } })
    if (currency)
      fireEvent.change(screen.getByLabelText('Currency'), { target: { value: currency } })
  }

  it('has a Currency box that starts on IQD and offers USD', async () => {
    await openPage()
    click(/new float/i)
    const select = screen.getByLabelText('Currency')
    expect(select).toHaveValue('IQD')
    expect(within(select).getByRole('option', { name: 'USD' })).toBeInTheDocument()
  })

  it('sends the chosen currency, not a fixed IQD', async () => {
    apiPost.mockResolvedValue({ data: {} })
    await fillNewFloat('USD')
    click(/create float/i)
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1)
    })
    const [url, body] = apiPost.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/finance/petty-cash/floats')
    expect(body.currency_code).toBe('USD')
    expect(body.name).toBe('Site cash')
    expect(body.authorized_limit).toBe(5000)
  })

  it('still sends IQD when the currency is left alone', async () => {
    apiPost.mockResolvedValue({ data: {} })
    await fillNewFloat(null)
    click(/create float/i)
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1)
    })
    expect((apiPost.mock.calls[0] as [string, Record<string, unknown>])[1].currency_code).toBe(
      'IQD',
    )
  })

  it('says why when the server refuses (it used to be swallowed), and keeps the form open', async () => {
    apiPost.mockRejectedValue({
      response: { data: { error: { message: 'Float name already exists' } } },
    })
    await fillNewFloat('USD')
    click(/create float/i)
    await waitFor(() => {
      expect(toasts()).toContain('Float name already exists')
    })
    expect(screen.getByPlaceholderText('e.g. Head Office Petty Cash')).toHaveValue('Site cash')
  })
})

describe('Edit Float: correcting the currency', () => {
  it('is offered to someone who can edit floats, and not to someone who can only view', async () => {
    await openPage()
    await selectFloat('Main Cash USD')
    expect(screen.getByRole('button', { name: 'Edit Float' })).toBeInTheDocument()
  })

  it('is hidden without the edit permission', async () => {
    perms = { 'finance.petty_cash.view': true }
    await openPage()
    await selectFloat('Main Cash USD')
    expect(screen.queryByRole('button', { name: 'Edit Float' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new float/i })).not.toBeInTheDocument()
  })

  it('opens filled with the float, and the currency can be changed while it only holds its opening balance', async () => {
    await openPage()
    await selectFloat('Main Cash USD')
    click('Edit Float')
    expect(screen.getByText('Edit Petty Cash Float')).toBeInTheDocument()
    expect(screen.getByLabelText('Float Name *')).toHaveValue('Main Cash USD')
    expect(screen.getByLabelText('Authorized Limit *')).toHaveValue(194337.94)
    expect(screen.getByLabelText('Cashbox (GL Account) *')).toHaveValue('gl-1')
    const currency = screen.getByLabelText('Currency')
    expect(currency).toHaveValue('IQD')
    expect(currency).toBeEnabled()
    expect(screen.getByTestId('edit-float-currency-hint')).toHaveTextContent(/choose it now/i)
  })

  it('saves the new currency with every field the server replaces, then shows the float in USD', async () => {
    apiPut.mockImplementation((url: string, body: Record<string, unknown>) => {
      floats = floats.map((f) =>
        f.id === 'f-1' ? { ...f, currency_code: String(body.currency_code) } : f,
      )
      return Promise.resolve({ data: {} })
    })
    await openPage()
    await selectFloat('Main Cash USD')
    click('Edit Float')
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } })
    click('Save Changes')
    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledTimes(1)
    })
    const [url, body] = apiPut.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/finance/petty-cash/floats/f-1')
    expect(body).toMatchObject({
      name: 'Main Cash USD',
      authorized_limit: 194337.94,
      gl_account_id: 'gl-1',
      is_active: true,
      currency_code: 'USD',
    })
    // the dialog closes, and the page now reads the float in USD (header balance and the float list)
    await waitFor(() => {
      expect(screen.queryByText('Edit Petty Cash Float')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getAllByText(/194,337.94 USD/).length).toBeGreaterThan(0)
    })
    expect(toasts()).toContain('Float updated')
  })

  it('locks the currency once the float has history, says so, and still lets the rest be edited', async () => {
    await openPage()
    await selectFloat('Main Cach IQD')
    click('Edit Float')
    const currency = screen.getByLabelText('Currency')
    expect(currency).toBeDisabled()
    expect(currency).toHaveValue('IQD')
    expect(screen.getByTestId('edit-float-currency-hint')).toHaveTextContent(
      /currency is locked.*in IQD.*Create a new float/i,
    )
    expect(screen.getByLabelText('Float Name *')).toBeEnabled()
    expect(screen.getByLabelText('Authorized Limit *')).toBeEnabled()
  })

  it('treats a server that did not say as locked', async () => {
    floats = [floatRow({ id: 'f-1', name: 'Main Cash USD', has_activity: undefined })]
    await openPage()
    await selectFloat('Main Cash USD')
    click('Edit Float')
    expect(screen.getByLabelText('Currency')).toBeDisabled()
  })

  it('sends the unchanged currency for a locked float (the server accepts it) along with the other edits', async () => {
    apiPut.mockResolvedValue({ data: {} })
    await openPage()
    await selectFloat('Main Cach IQD')
    click('Edit Float')
    fireEvent.change(screen.getByLabelText('Authorized Limit *'), { target: { value: '70000000' } })
    click('Save Changes')
    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledTimes(1)
    })
    const body = (apiPut.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(body.currency_code).toBe('IQD')
    expect(body.authorized_limit).toBe(70000000)
  })

  it("shows the server's reason when it refuses, and keeps the dialog and what was typed", async () => {
    apiPut.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'FLOAT_HAS_ACTIVITY',
            message: 'This float already has spends, so the currency can no longer be changed.',
          },
        },
      },
    })
    await openPage()
    await selectFloat('Main Cash USD')
    click('Edit Float')
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } })
    fireEvent.change(screen.getByLabelText('Float Name *'), { target: { value: 'Renamed' } })
    click('Save Changes')
    await waitFor(() => {
      expect(toasts()).toContain(
        'This float already has spends, so the currency can no longer be changed.',
      )
    })
    expect(screen.getByText('Edit Petty Cash Float')).toBeInTheDocument()
    expect(screen.getByLabelText('Float Name *')).toHaveValue('Renamed')
    expect(screen.getByLabelText('Currency')).toHaveValue('USD')
  })

  it('falls back to a plain message when the failure carries none', async () => {
    apiPut.mockRejectedValue(new Error('Network Error'))
    await openPage()
    await selectFloat('Main Cash USD')
    click('Edit Float')
    click('Save Changes')
    await waitFor(() => {
      expect(toasts()).toContain('Could not save the float')
    })
  })

  it('keeps Save Changes off until the float has a name, a limit and a cashbox', async () => {
    await openPage()
    await selectFloat('Main Cash USD')
    click('Edit Float')
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Cashbox (GL Account) *'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  it('offers a currency the float already has even when it is not in the usual list', async () => {
    floats = [
      floatRow({ id: 'f-1', name: 'Main Cash USD', currency_code: 'SAR', has_activity: false }),
    ]
    await openPage()
    await selectFloat('Main Cash USD')
    click('Edit Float')
    const currency = screen.getByLabelText('Currency')
    expect(currency).toHaveValue('SAR')
    expect(within(currency).getByRole('option', { name: 'SAR' })).toBeInTheDocument()
  })

  it('Cancel closes the dialog without saving', async () => {
    await openPage()
    await selectFloat('Main Cash USD')
    click('Edit Float')
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } })
    click('Cancel') // only this dialog is open, so there is one Cancel
    expect(screen.queryByText('Edit Petty Cash Float')).not.toBeInTheDocument()
    expect(apiPut).not.toHaveBeenCalled()
  })
})

describe('the float header', () => {
  it('names the currency of the authorized limit as well as the balance', async () => {
    floats = [floatRow({ id: 'f-1', name: 'Main Cash USD', currency_code: 'USD' })]
    await openPage()
    await selectFloat('Main Cash USD')
    // the float list also prints "194,337.94 USD", so read each header figure under its own caption
    const under = (caption: string): string =>
      screen.getByText(caption).nextElementSibling?.textContent ?? ''
    expect(under('Current Balance')).toBe('194,337.94 USD')
    expect(under('Authorized Limit')).toBe('194,337.94 USD')
  })
})
