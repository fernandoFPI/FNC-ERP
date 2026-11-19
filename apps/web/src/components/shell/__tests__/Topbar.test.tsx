// The top bar in the newer look: a breadcrumb that is a real trail (links above, the current page strongest), a notification button
// that says how many are unread, and a user menu that works from the keyboard, stays open when the pointer leaves it, and closes on
// Escape or a press outside. On a phone the bar is only the menu button, the trail and the company badge.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import i18n from '../../../i18n'
import { useAuthStore } from '../../../store/authStore'
import { useCompanyStore } from '../../../store/companyStore'
import { useNotificationStore } from '../../../store/notificationStore'
import { useBreadcrumbStore } from '../../../store/breadcrumbStore'
import { Topbar } from '../Topbar'
import { shellFocusRing } from '../shellParts'

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value')
  return value
}

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
mocks.get.mockRejectedValue(new Error('offline'))
vi.mock('../../../lib/axios', () => ({
  api: {
    get: mocks.get,
    post: vi.fn().mockRejectedValue(new Error('offline')),
    patch: vi.fn().mockResolvedValue({}),
  },
}))

const light = themes['light-flat']
const ID = '3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab'

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

beforeEach(() => {
  localStorage.clear()
  // names registered by one test (useBreadcrumbTitle) must not reach the next one: the store only clears itself when the signed-in user or company
  // changes, and every test here signs in the same user, so without this the tests that expect the "#3f2b8c1e" fallback see a leftover name
  useBreadcrumbStore.getState().clear()
  setWidth(1440)
  useAuthStore.setState({
    user: {
      id: 'u1',
      email: 'fernando@example.com',
      role: 'system_admin',
      system_admin: true,
      mfaEnabled: false,
      firstName: 'Fernando',
      lastName: 'Yousif',
      profilePicture: null,
      permissions: {},
    } as never,
    isAuthenticated: true,
    accessToken: 'tok',
  })
  const companies = [
    { id: '1', name: 'Nishtimani Yakam', currencyCode: 'IQD' },
    { id: '2', name: 'Al Watanyia', currencyCode: 'USD' },
  ]
  useCompanyStore.setState({ activeCompany: companies[0], companies })
  useNotificationStore.setState({ unreadCount: 0 })
})
afterEach(async () => {
  restoreSpies()
  setWidth(1024)
  await i18n.changeLanguage('en')
})

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}

function show(
  path = '/procurement/purchase-orders',
  props: Partial<React.ComponentProps<typeof Topbar>> = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <Topbar {...props} />
        <Where />
        <span>outside</span>
      </ThemeProvider>
    </MemoryRouter>,
  )
}
const where = () => screen.getByTestId('where').textContent
// Say what the browser would answer for ":focus-visible" and leave every other selector to the real `matches`.
const spies: { mockRestore: () => void }[] = []
const restoreSpies = () => {
  while (spies.length) spies.pop()?.mockRestore()
}
const focusVisible = (answer: boolean) => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = Element.prototype.matches
  const spy = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':focus-visible' ? answer : original.call(this, selector)
  })
  spies.push(spy)
  return spy
}

describe('the bar itself', () => {
  it('is 56px high like the sidebar header, so the two lines meet, and owns the notch above it on a phone', () => {
    show()
    const bar = screen.getByRole('banner')
    expect(bar).toHaveStyle({ boxSizing: 'border-box' })
    expect(bar.style.height).toBe('calc(56px + var(--safe-top))')
    expect(bar.style.paddingTop).toBe('var(--safe-top)')
  })

  it("keeps the page's own side gutter: 20px on a desktop, 16 on a tablet, 12 on a phone", () => {
    const gutter = () => screen.getByRole('banner').style.paddingInline
    const { unmount } = show()
    expect(gutter()).toBe('20px')
    unmount()
    setWidth(390)
    show('/procurement/purchase-orders', { compact: true })
    expect(gutter()).toBe('12px')
  })
})

describe('the breadcrumb', () => {
  it('is a navigation landmark with a name', () => {
    show()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
  })

  it('makes the pages above you links, and the current page a strong label that is not a link', () => {
    show()
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const up = within(trail).getByRole('link', { name: 'Procurement' })
    expect(up).toHaveAttribute('href', '/procurement')
    expect(up).toHaveStyle({ color: light.textSecondary })
    const here = within(trail).getByText('Purchase Orders')
    expect(here).toHaveAttribute('aria-current', 'page')
    expect(here).toHaveStyle({ color: light.textPrimary, fontWeight: '600' })
    expect(within(trail).queryByRole('link', { name: 'Purchase Orders' })).toBeNull()
  })

  it('goes where a link in the trail says', () => {
    show()
    fireEvent.click(screen.getByRole('link', { name: 'Procurement' }))
    expect(where()).toBe('/procurement')
  })

  it('shows an id in the trail as plain text with its first characters, not as a link', () => {
    show(`/projects/${ID}/invoices`)
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(trail).getByText('#3f2b8c1e')).toBeInTheDocument()
    expect(within(trail).queryByRole('link', { name: '#3f2b8c1e' })).toBeNull()
    expect(within(trail).getByText('Invoices')).toHaveAttribute('aria-current', 'page')
  })

  it('shows the name a record page registered for its id instead of the id fragment', () => {
    useBreadcrumbStore.getState().setTitle(ID, 'REQ-2026-0075')
    show(`/procurement/requisitions/${ID}`)
    const here = screen.getByText('REQ-2026-0075')
    expect(here).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByText('#3f2b8c1e')).toBeNull()
  })

  it('shows the registered name in the middle of the trail too, still as plain text', () => {
    useBreadcrumbStore.getState().setTitle(ID, 'NY-PRJ-2026-0032')
    show(`/projects/${ID}/invoices`)
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(trail).getByText('NY-PRJ-2026-0032')).toBeInTheDocument()
    expect(within(trail).queryByRole('link', { name: 'NY-PRJ-2026-0032' })).toBeNull()
    expect(within(trail).queryByText('#3f2b8c1e')).toBeNull()
  })

  it('keeps the fallback for an id nobody registered, and does not show another record\'s name', () => {
    useBreadcrumbStore.getState().setTitle('00000000-0000-4000-8000-000000000000', 'Other record')
    show(`/procurement/requisitions/${ID}`)
    expect(screen.getByText('#3f2b8c1e')).toBeInTheDocument()
    expect(screen.queryByText('Other record')).toBeNull()
  })

  it('shows a registered name for a numeric id as well', () => {
    useBreadcrumbStore.getState().setTitle('12345', 'JE-2026-00012')
    show('/finance/journals/12345')
    expect(screen.getByText('JE-2026-00012')).toHaveAttribute('aria-current', 'page')
  })

  it('updates the trail when the name arrives after the page has rendered', () => {
    show(`/procurement/requisitions/${ID}`)
    expect(screen.getByText('#3f2b8c1e')).toBeInTheDocument()
    act(() => {
      useBreadcrumbStore.getState().setTitle(ID, 'REQ-2026-0075')
    })
    expect(screen.getByText('REQ-2026-0075')).toBeInTheDocument()
    expect(screen.queryByText('#3f2b8c1e')).toBeNull()
  })

  it('treats a plain number in the trail as an id too: text, not a link', () => {
    show('/finance/journals/12345/lines')
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(trail).getByText('12345')).toBeInTheDocument()
    expect(within(trail).queryByRole('link', { name: '12345' })).toBeNull()
    expect(within(trail).getByRole('link', { name: 'Journal Entries' })).toHaveAttribute(
      'href',
      '/finance/journals',
    )
  })

  it('when the page itself is an id, the id is the current page', () => {
    show(`/procurement/requisitions/${ID}`)
    expect(screen.getByText('#3f2b8c1e')).toHaveAttribute('aria-current', 'page')
  })

  it('darkens a link under the pointer and rings it only for the keyboard', () => {
    show()
    const up = screen.getByRole('link', { name: 'Procurement' })
    fireEvent.mouseEnter(up)
    expect(up).toHaveStyle({ color: light.textPrimary, textDecoration: 'underline' })
    fireEvent.mouseLeave(up)
    expect(up).toHaveStyle({ textDecoration: 'none' })
    const spy = focusVisible(true)
    fireEvent.focus(up)
    expect(up.style.boxShadow).toBe(shellFocusRing(light))
    spy.mockRestore()
    fireEvent.blur(up)
    focusVisible(false)
    fireEvent.focus(up)
    expect(up.style.boxShadow).toBe('none')
  })

  it('names the trail in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    show()
    expect(screen.getByRole('navigation', { name: i18n.t('shell.breadcrumb') })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/shell\./)
  })
})

describe('the buttons on the right', () => {
  it('opens the search palette from the search button, which names its shortcut', () => {
    const seen: Event[] = []
    const onOpen = (e: Event) => seen.push(e)
    window.addEventListener('fnc:open-search', onOpen)
    show()
    const b = screen.getByRole('button', { name: 'Search' })
    expect(b).toHaveAttribute('aria-keyshortcuts', 'Control+K')
    // it looks like a search box: the readable edge the form fields have, not the borderless icon buttons
    expect(b).toHaveStyle({ border: `1px solid ${light.borderField}` })
    fireEvent.click(b)
    expect(seen).toHaveLength(1)
    expect(seen[0] instanceof CustomEvent && seen[0].detail).toEqual({ prefill: '' })
    window.removeEventListener('fnc:open-search', onOpen)
  })

  it('draws a hairline divider before the language button, as a hidden decoration', () => {
    show()
    const divider = document.querySelector<HTMLElement>('span[style*="width: 1px"]')
    expect(divider).not.toBeNull()
    expect(divider).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the language and theme buttons beside the bell and the avatar', () => {
    show()
    expect(screen.getByRole('button', { name: 'Switch language' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch theme' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'User menu' })).toBeInTheDocument()
  })
})

describe('notifications', () => {
  it("says how many are unread in the button's name and in a badge", () => {
    useNotificationStore.setState({ unreadCount: 5 })
    show()
    const b = screen.getByRole('button', { name: 'Notifications, 5 unread' })
    expect(within(b).getByText('5')).toHaveStyle({
      background: light.danger,
      color: light.bgSurface,
    })
    // the button's name already says how many, so the badge is only a picture for a screen reader
    expect(within(b).getByText('5')).toHaveAttribute('aria-hidden', 'true')
  })

  it('has no badge and the plain name when everything is read', () => {
    show()
    const b = screen.getByRole('button', { name: 'Notifications' })
    expect(b.querySelector('span')).toBeNull()
  })

  it('caps the badge at 99+ but keeps the real number in the name', () => {
    useNotificationStore.setState({ unreadCount: 120 })
    show()
    const b = screen.getByRole('button', { name: 'Notifications, 120 unread' })
    expect(within(b).getByText('99+')).toBeInTheDocument()
  })

  it('opens the notifications drawer and shows the button as open', () => {
    show()
    const b = screen.getByRole('button', { name: 'Notifications' })
    fireEvent.click(b)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(b).toHaveStyle({ background: light.accentBg })
  })
})

describe('who is signed in', () => {
  const profileCalls = () =>
    (mocks.get.mock.calls as unknown[][]).filter(([url]) => url === '/users/me/profile')

  beforeEach(() => {
    mocks.get.mockClear()
  })
  afterEach(() => {
    mocks.get.mockReset().mockRejectedValue(new Error('offline'))
  })

  it('does not ask for the profile of someone who has not completed one', () => {
    show()
    expect(profileCalls()).toHaveLength(0)
  })

  it('asks for the profile once when it is complete, and shows the name and picture it returns', async () => {
    useAuthStore.setState({
      user: { ...useAuthStore.getState().user, profileCompleted: true } as never,
    })
    mocks.get.mockImplementation((url: string) =>
      url === '/users/me/profile'
        ? Promise.resolve({
            data: { firstName: 'Nadia', lastName: 'Saleh', profilePicture: 'https://x.test/n.png' },
          })
        : Promise.reject(new Error('offline')),
    )
    show()
    await waitFor(() => {
      expect(useAuthStore.getState().user?.firstName).toBe('Nadia')
    })
    expect(profileCalls()).toHaveLength(1)
    expect(useAuthStore.getState().user?.profilePicture).toBe('https://x.test/n.png')
  })
})

describe('the user menu', () => {
  const avatar = () => screen.getByRole('button', { name: 'User menu' })
  const open = () => fireEvent.click(avatar())

  it('starts closed and says so', () => {
    show()
    expect(avatar()).toHaveAttribute('aria-haspopup', 'menu')
    expect(avatar()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens a named menu with Profile, Settings and Sign out, and who is signed in above it', () => {
    show()
    open()
    const menu = screen.getByRole('menu', { name: 'User menu' })
    expect(avatar()).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Profile', 'Settings', 'Sign out'])
    expect(screen.getByText('Fernando Yousif')).toBeInTheDocument()
    expect(screen.getByText('fernando@example.com')).toHaveStyle({ color: light.textSecondary })
    expect(menu).not.toContainElement(screen.getByText('Fernando Yousif'))
  })

  it('gives the keyboard to the first row as it opens', () => {
    show()
    open()
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus()
  })

  it('opens toward the start of the page from the avatar, so it never runs off the screen edge', () => {
    show()
    open()
    const panel = must(screen.getByRole('menu').parentElement)
    expect(panel.style.insetInlineEnd).toBe('0')
    expect(panel.style.insetInlineStart).toBe('')
  })

  it('stays open when the pointer leaves it (it used to vanish as soon as the mouse slipped off)', () => {
    show()
    open()
    const menu = screen.getByRole('menu')
    fireEvent.mouseLeave(menu)
    fireEvent.mouseLeave(must(menu.parentElement))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('closes on Escape and gives the keyboard back to the avatar', () => {
    show()
    open()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(avatar()).toHaveFocus()
  })

  it('closes on a press outside, and on a second press of the avatar', () => {
    show()
    open()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
    open()
    open()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('moves between the rows with the arrow keys', () => {
    show()
    open()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus()
  })

  it('goes to Profile and to Settings, and closes', () => {
    show()
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profile' }))
    expect(where()).toBe('/settings/profile')
    expect(screen.queryByRole('menu')).toBeNull()
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    expect(where()).toBe('/settings')
  })

  it('signs out in the danger colour, clears the session and goes to the login page', () => {
    show()
    open()
    const out = screen.getByRole('menuitem', { name: 'Sign out' })
    expect(out).toHaveStyle({ color: light.danger })
    fireEvent.click(out)
    expect(useAuthStore.getState().user).toBeNull()
    expect(where()).toBe('/login')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('turns the avatar edge to the solid accent while the menu is open', () => {
    show()
    expect(avatar()).toHaveStyle({ border: `1px solid ${light.accentBorder}` })
    open()
    expect(avatar()).toHaveStyle({ border: `1px solid ${light.accentSolid}` })
    open()
    expect(avatar()).toHaveStyle({ border: `1px solid ${light.accentBorder}` })
  })

  it('shows the initials when there is no picture, and the picture when there is one', () => {
    const { unmount } = show()
    expect(avatar()).toHaveTextContent('FE')
    unmount()
    useAuthStore.setState({
      user: {
        ...useAuthStore.getState().user,
        profilePicture: 'https://example.com/me.png',
      } as never,
    })
    show()
    expect(within(avatar()).getByRole('img')).toHaveAttribute('src', 'https://example.com/me.png')
  })

  it('names itself in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    show()
    expect(screen.getByRole('button', { name: i18n.t('shell.userMenu') })).toBeInTheDocument()
  })
})

describe('compact bars', () => {
  it('has no menu button on a desktop, and a 40px one when compact that runs the handler', () => {
    const { unmount } = show()
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    unmount()
    const onMenuToggle = vi.fn()
    show('/procurement/purchase-orders', { compact: true, onMenuToggle })
    const b = screen.getByRole('button', { name: 'Open menu' })
    expect(b).toHaveStyle({ width: '40px', height: '40px' })
    fireEvent.click(b)
    expect(onMenuToggle).toHaveBeenCalledTimes(1)
  })

  it('on a phone is the menu button, the trail and the company badge, and nothing else', () => {
    setWidth(390)
    show('/procurement/purchase-orders', { compact: true })
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Switch company/ })).toBeInTheDocument()
    for (const name of [
      'Search',
      'Switch language',
      'Switch theme',
      'Notifications',
      'User menu',
    ]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })
})
