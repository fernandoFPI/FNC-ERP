// The company switcher as a menu: a named group of radio rows with the active company checked, the keyboard (arrows, Escape returning to
// the button), switching through the API with the failure shown inside the menu, and the round badge on a phone. (Opening, listing
// and closing on an outside press are in EntitySwitcher.test.tsx.)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import i18n from '../../../i18n'
import { useAuthStore } from '../../../store/authStore'
import { useCompanyStore } from '../../../store/companyStore'
import { EntitySwitcher } from '../EntitySwitcher'

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value')
  return value
}

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), clearStore: vi.fn() }))
vi.mock('../../../lib/axios', () => ({ api: { get: mocks.get, post: mocks.post } }))
vi.mock('../../../lib/apollo', () => ({ apolloClient: { clearStore: mocks.clearStore } }))
vi.mock('../../../lib/jwt', () => ({
  decodeJWT: () => ({ companyId: '2', role: 'company_admin' }),
}))

const light = themes['light-flat']
const companies = [
  { id: '1', name: 'Nishtimani Yakam', currencyCode: 'IQD' },
  { id: '2', name: 'Al Watanyia', currencyCode: 'USD' },
  { id: '3', name: 'Nishtimani Factory', currencyCode: 'IQD' },
]

beforeEach(() => {
  localStorage.clear()
  mocks.get.mockReset().mockResolvedValue({ data: [] })
  mocks.post.mockReset().mockResolvedValue({ data: { accessToken: 'new-token', employeeId: 'e1' } })
  mocks.clearStore.mockReset().mockResolvedValue(undefined)
  useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c', role: 'company_admin' } as never })
  useCompanyStore.setState({ activeCompany: companies[0], companies })
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}
function show(props: { compact?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders']}>
      <ThemeProvider>
        <EntitySwitcher {...props} />
        <Where />
      </ThemeProvider>
    </MemoryRouter>,
  )
}
const trigger = () => screen.getByRole('button', { name: /Nishtimani Yakam/ })
const open = () => fireEvent.click(trigger())
const row = (name: string) => screen.getByRole('menuitemradio', { name: new RegExp(name) })
const where = () => screen.getByTestId('where').textContent

describe('the menu', () => {
  it('is a named menu of radio rows, the active company checked and the others not', () => {
    show()
    open()
    const menu = screen.getByRole('menu', { name: 'Switch company' })
    const rows = within(menu).getAllByRole('menuitemradio')
    expect(rows).toHaveLength(3)
    expect(row('Nishtimani Yakam')).toHaveAttribute('aria-checked', 'true')
    expect(row('Al Watanyia')).toHaveAttribute('aria-checked', 'false')
    expect(row('Nishtimani Factory')).toHaveAttribute('aria-checked', 'false')
  })

  it('draws a tick on the active company only, so the choice is not carried by colour alone', () => {
    show()
    open()
    expect(row('Nishtimani Yakam').querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(row('Al Watanyia').querySelector('svg')).toBeNull()
    expect(row('Nishtimani Factory').querySelector('svg')).toBeNull()
  })

  it("shows each company's currency under its name, in the readable grey", () => {
    show()
    open()
    expect(within(row('Al Watanyia')).getByText('USD')).toHaveStyle({ color: light.textSecondary })
  })

  it('says it is open, and gives the keyboard to the first row', () => {
    show()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    open()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(row('Nishtimani Yakam')).toHaveFocus()
  })

  it('moves with the arrow keys and closes on Escape, giving the keyboard back to the button', () => {
    show()
    open()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(row('Al Watanyia')).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(row('Nishtimani Factory')).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveFocus()
  })

  it('asks the API for the current list of companies when it opens, not when it closes', () => {
    show()
    open()
    expect(mocks.get).toHaveBeenCalledWith('/auth/me/companies')
    expect(mocks.get).toHaveBeenCalledTimes(1)
    open()
    expect(mocks.get).toHaveBeenCalledTimes(1)
  })

  it('keeps the list it has when the API answers with no companies at all', async () => {
    mocks.get.mockResolvedValue({ data: [] })
    show()
    open()
    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledTimes(1)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
    expect(useCompanyStore.getState().companies).toHaveLength(3)
  })

  it('adds a company the person was given mid-session when the list comes back', async () => {
    mocks.get.mockResolvedValue({
      data: [
        ...companies.map((c) => ({ id: c.id, name: c.name, currency_code: c.currencyCode })),
        { id: '4', name: 'New Branch Co', currency_code: 'EUR' },
      ],
    })
    show()
    open()
    expect(await screen.findByRole('menuitemradio', { name: /New Branch Co/ })).toBeInTheDocument()
  })

  it('names its caption and rows in Arabic with no raw key', async () => {
    await i18n.changeLanguage('ar')
    show()
    fireEvent.click(screen.getByRole('button', { name: /Nishtimani Yakam/ }))
    expect(screen.getByRole('menu', { name: i18n.t('shell.switchCompany') })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/shell\./)
  })
})

describe('switching', () => {
  it('closes without calling the API when the company that is already active is chosen', () => {
    show()
    open()
    fireEvent.click(row('Nishtimani Yakam'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('switches company through the API, clears the cached data, shows the new company and goes to the dashboard', async () => {
    show()
    open()
    fireEvent.click(row('Al Watanyia'))
    await waitFor(() => {
      expect(useCompanyStore.getState().activeCompany?.id).toBe('2')
    })
    expect(mocks.post).toHaveBeenCalledWith('/auth/company/switch', { companyId: '2' })
    expect(mocks.clearStore).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe('new-token')
    expect(where()).toBe('/dashboard')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('gives the keyboard back to the button after a switch, which now names the new company', async () => {
    show()
    open()
    fireEvent.click(row('Al Watanyia'))
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
    expect(screen.getByRole('button', { name: /Al Watanyia/ })).toHaveFocus()
  })

  it("shows the server's reason inside the menu, keeps the menu open and keeps the company", async () => {
    mocks.post.mockRejectedValue({ response: { data: { message: 'You no longer have access' } } })
    show()
    open()
    fireEvent.click(row('Al Watanyia'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('You no longer have access')
    expect(alert).toHaveStyle({ color: light.danger })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(useCompanyStore.getState().activeCompany?.id).toBe('1')
    expect(where()).toBe('/procurement/purchase-orders')
  })

  it('says "Switch failed" when the server gave no reason', async () => {
    mocks.post.mockRejectedValue(new Error('network'))
    show()
    open()
    fireEvent.click(row('Al Watanyia'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Switch failed')
  })

  it('clears an old failure when the menu is opened again', async () => {
    mocks.post.mockRejectedValue(new Error('network'))
    show()
    open()
    fireEvent.click(row('Al Watanyia'))
    await screen.findByRole('alert')
    open()
    open()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('the two buttons', () => {
  it('is a bordered pill with a dot, the name and a chevron that turns over while the menu is open', () => {
    show()
    const t = trigger()
    expect(t).toHaveStyle({ border: `1px solid ${light.borderField}` })
    const chevron = t.querySelector<SVGElement>('svg')
    expect(chevron).toHaveAttribute('aria-hidden', 'true')
    expect(chevron?.style.transform).toBe('none')
    open()
    expect(chevron?.style.transform).toBe('rotate(180deg)')
    expect(t).toHaveStyle({ background: light.accentBg })
  })

  it('shows a company that has no name yet as "Select company"', () => {
    useCompanyStore.setState({ activeCompany: null })
    show()
    expect(screen.getByRole('button', { name: 'Select company' })).toBeInTheDocument()
  })

  it('is a round badge of the initials on a phone, named for what it does and for the company', () => {
    show({ compact: true })
    const b = screen.getByRole('button', { name: 'Switch company (Nishtimani Yakam)' })
    expect(b).toHaveTextContent('NY')
    expect(b).toHaveStyle({ width: '36px', borderRadius: '50%' })
    expect(b).toHaveAttribute('title', 'Nishtimani Yakam')
  })

  it('says on the round badge whether its menu is open', () => {
    show({ compact: true })
    const b = screen.getByRole('button', { name: /Switch company/ })
    expect(b).toHaveAttribute('aria-haspopup', 'menu')
    expect(b).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'false')
  })

  it("opens the phone badge's menu toward the start of the page, not past the screen edge", () => {
    show({ compact: true })
    fireEvent.click(screen.getByRole('button', { name: /Switch company/ }))
    const panel = must(screen.getByRole('menu').parentElement)
    expect(panel.style.insetInlineEnd).toBe('0')
    expect(panel.style.insetInlineStart).toBe('')
  })

  it("opens the desktop pill's menu from its own start edge", () => {
    show()
    open()
    const panel = must(screen.getByRole('menu').parentElement)
    expect(panel.style.insetInlineStart).toBe('0')
  })
})
