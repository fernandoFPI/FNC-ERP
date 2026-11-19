// The sidebar in the newer look: every row is one pill (tint and solid-accent text for the page you are on, the readable grey for the
// rest), a group is a real button that says whether it is open (the old row was a div the keyboard could not reach), the icon-only rail
// is named for a screen reader and shows a waiting queue as a dot, and in Arabic the chevrons point the other way. Which rows exist is
// still decided by the same permission checks (the last block).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import i18n from '../../../i18n'
import { useAuthStore } from '../../../store/authStore'
import { useApprovalStore } from '../../../store/approvalStore'
import { Sidebar } from '../Sidebar'
import { shellFocusRing } from '../shellParts'

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value')
  return value
}

const hoisted = vi.hoisted(() => ({ queue: 0 }))
vi.mock('../../../hooks/useMyQueueCount', () => ({ useMyQueueCount: () => hoisted.queue }))
vi.mock('../../../lib/axios', () => ({
  api: { get: vi.fn().mockRejectedValue(new Error('offline')), post: vi.fn() },
}))

const light = themes['light-flat']

const setUser = (over: Record<string, unknown> = {}) => {
  useAuthStore.setState({
    user: {
      id: 'u1',
      email: 'user@fnc.com',
      role: 'company_admin',
      mfaEnabled: false,
      system_admin: false,
      permissions: {},
      ...over,
    } as never,
    isAuthenticated: true,
    accessToken: 'tok',
    refreshToken: 'ref',
  })
}

beforeEach(() => {
  localStorage.clear()
  hoisted.queue = 0
  useApprovalStore.setState({ overdueMaintenanceCount: 0 })
  setUser()
})
afterEach(async () => {
  restoreSpies()
  await i18n.changeLanguage('en')
})

function show(
  path = '/procurement/purchase-orders',
  props: Partial<React.ComponentProps<typeof Sidebar>> = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <Sidebar {...props} />
      </ThemeProvider>
    </MemoryRouter>,
  )
}
const link = (name: string | RegExp) => screen.getByRole('link', { name })
const groupButton = (name: RegExp) => screen.getByRole('button', { name })
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

describe('the landmark and the page you are on', () => {
  it('is a navigation landmark with a name, and every section is a named group inside it', () => {
    show()
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    for (const section of ['Overview', 'Finance', 'Procurement', 'Inventory']) {
      expect(within(nav).getByRole('group', { name: section })).toBeInTheDocument()
    }
  })

  it('marks the page you are on with the tint, the solid accent text and aria-current, and no other row', () => {
    show()
    const here = link('Purchase Orders')
    expect(here).toHaveAttribute('aria-current', 'page')
    expect(here).toHaveStyle({ background: light.accentBg, color: light.accentSolid })
    const other = link('Requisitions')
    expect(other).not.toHaveAttribute('aria-current')
    expect(other).toHaveStyle({ background: 'transparent', color: light.textSecondary })
  })

  it('sets the page you are on in a heavier weight, so it is not told apart by colour alone', () => {
    show()
    expect(link('Purchase Orders')).toHaveStyle({ fontWeight: '600' })
    expect(link('Requisitions')).toHaveStyle({ fontWeight: '500' })
  })

  it('reads every inactive row in the readable grey, never the pale one (2.6:1)', () => {
    show()
    for (const name of ['Dashboard', 'Vendors', 'Requisitions']) {
      expect(link(name)).toHaveStyle({ color: light.textSecondary })
      expect(link(name)).not.toHaveStyle({ color: light.textMuted })
    }
  })

  it('draws the accent bar beside the page you are on only, as a hidden decoration', () => {
    show()
    const bar = (name: string) =>
      link(name).querySelector<HTMLElement>('span[aria-hidden="true"][style*="width: 3px"]')
    expect(bar('Purchase Orders')).not.toBeNull()
    expect(bar('Requisitions')).toBeNull()
  })

  it('takes the tint under the pointer on a row that is not the page, and gives it back', () => {
    show()
    const row = link('Vendors')
    fireEvent.mouseEnter(row)
    expect(row).toHaveStyle({ background: light.bgSurfaceHover, color: light.textPrimary })
    fireEvent.mouseLeave(row)
    expect(row).toHaveStyle({ background: 'transparent' })
  })

  it('shows the section headings in the readable grey too', () => {
    show()
    expect(screen.getByText('Finance')).toHaveStyle({ color: light.textSecondary })
  })
})

describe('a group of pages', () => {
  it('is a button that says it is closed and opens on a press, then closes on the next', () => {
    show('/dashboard')
    const g = groupButton(/Reporting/)
    expect(g).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Executive')).toBeNull()
    fireEvent.click(g)
    expect(g).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Executive')).toBeInTheDocument()
    fireEvent.click(g)
    expect(g).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Executive')).toBeNull()
  })

  it('points at the list it opens, and only while it is open', () => {
    show('/dashboard')
    const g = groupButton(/Reporting/)
    expect(g).not.toHaveAttribute('aria-controls')
    fireEvent.click(g)
    const id = g.getAttribute('aria-controls')
    expect(id).toBeTruthy()
    const list = document.getElementById(must(id))
    expect(list).not.toBeNull()
    expect(list).toContainElement(screen.getByText('Executive'))
  })

  it('opens by itself on the group that holds the page you are on', () => {
    show('/reporting/executive')
    expect(groupButton(/Reporting/)).toHaveAttribute('aria-expanded', 'true')
  })

  it('while open, lets the page inside carry the tint and only turns its own text accent', () => {
    show('/reporting/executive')
    const g = groupButton(/Reporting/)
    expect(g).toHaveStyle({ background: 'transparent', color: light.accentSolid })
    const inside = link('Executive')
    expect(inside).toHaveAttribute('aria-current', 'page')
    expect(inside).toHaveStyle({ background: light.accentBg, color: light.accentSolid })
  })

  it('once closed, carries the tint itself so you can still see where you are', () => {
    show('/reporting/executive')
    const g = groupButton(/Reporting/)
    fireEvent.click(g)
    expect(g).toHaveStyle({ background: light.accentBg, color: light.accentSolid })
  })

  it('draws a guide line down the pages of an open group, in the stronger edge so it can be seen', () => {
    show('/reporting/executive')
    const list = must(
      document.getElementById(must(groupButton(/Reporting/).getAttribute('aria-controls'))),
    )
    expect(list.style.borderInlineStart).toContain('1px solid')
    expect(list.getAttribute('style')).toContain(light.borderStrong)
  })

  it('keeps a page inside a group quieter than a top-level row (shorter, no bar)', () => {
    show('/reporting/executive')
    const inside = link('Executive')
    expect(inside).toHaveStyle({ minHeight: '34px' })
    expect(link('Dashboard')).toHaveStyle({ minHeight: '38px' })
    expect(inside.querySelector('span[aria-hidden="true"][style*="width: 3px"]')).toBeNull()
  })
})

describe('the waiting-queue count', () => {
  it('is a solid pill after the label while the sidebar is open, and absent when nothing is waiting', () => {
    hoisted.queue = 17
    const { unmount } = show()
    const row = link(/My Queue/)
    expect(within(row).getByText('17')).toHaveStyle({
      background: light.accentSolid,
      color: light.accentSolidText,
    })
    unmount()
    hoisted.queue = 0
    show()
    expect(within(link('My Queue')).queryByText('0')).toBeNull()
  })

  it("becomes a dot in the icon rail, with the number in the row's name (a screen reader still hears it)", () => {
    hoisted.queue = 17
    show('/procurement/purchase-orders', { rail: true })
    const row = link('My Queue (17)')
    expect(within(row).queryByText('17')).toBeNull()
    expect(
      row.querySelector('span[aria-hidden="true"][style*="border-radius: 50%"]'),
    ).not.toBeNull()
  })
})

describe('an overdue count on a page inside a group', () => {
  it('is the danger tint, not the solid pill of a waiting queue, because it means late', () => {
    useApprovalStore.setState({ overdueMaintenanceCount: 3 })
    show('/rental/maintenance')
    const row = link(/Maintenance/)
    expect(within(row).getByText('3')).toHaveStyle({
      background: light.dangerBg,
      color: light.danger,
    })
    expect(within(row).getByText('3')).not.toHaveStyle({ background: light.accentSolid })
  })

  it('is left out when nothing is overdue', () => {
    useApprovalStore.setState({ overdueMaintenanceCount: 0 })
    show('/rental/maintenance')
    expect(within(link(/Maintenance/)).queryByText('0')).toBeNull()
  })
})

describe('the icon-only rail', () => {
  it('has no label text, and names every row for a screen reader and a tooltip', () => {
    show('/procurement/purchase-orders', { rail: true })
    expect(screen.queryByText('Dashboard')).toBeNull()
    const dash = link('Dashboard')
    expect(dash).toHaveAttribute('title', 'Dashboard')
    expect(dash).toHaveAttribute('aria-label', 'Dashboard')
  })

  it('draws every row as a centred 40px square, the page you are on tinted', () => {
    show('/procurement/purchase-orders', { rail: true })
    expect(link('Purchase Orders')).toHaveStyle({
      width: '40px',
      minHeight: '40px',
      background: light.accentBg,
    })
    expect(link('Vendors')).toHaveStyle({ width: '40px', background: 'transparent' })
  })

  it('has no accent bar, because the tinted square is enough in 60px', () => {
    show('/procurement/purchase-orders', { rail: true })
    expect(
      link('Purchase Orders').querySelector('span[aria-hidden="true"][style*="width: 3px"]'),
    ).toBeNull()
  })

  it('keeps the sections apart with a hairline where the headings used to be', () => {
    show('/procurement/purchase-orders', { rail: true })
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const sections = within(nav).getAllByRole('group').length
    expect(within(nav).getAllByRole('separator')).toHaveLength(sections - 1)
  })

  it('turns a group into a link to its first page', () => {
    show('/dashboard', { rail: true })
    expect(link('Reporting')).toHaveAttribute('href', '/reporting/executive')
    expect(screen.queryByRole('button', { name: /Reporting/ })).toBeNull()
  })

  it('has one button in its header, to open the sidebar', () => {
    const onToggle = vi.fn()
    show('/dashboard', { rail: true, onToggle })
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('the header', () => {
  it('has a collapse button that says whether the sidebar is open, and flips with each press', () => {
    show()
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(collapse)
    const expand = screen.getByRole('button', { name: 'Expand sidebar' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
  })

  it('is 56px tall in every mode, the same as the top bar, so the two hairlines meet in one line', () => {
    const open = show()
    expect(
      must(screen.getByRole('button', { name: 'Collapse sidebar' }).parentElement),
    ).toHaveStyle({ height: '56px' })
    open.unmount()
    const asRail = show('/dashboard', { rail: true })
    expect(must(screen.getByRole('button', { name: 'Expand sidebar' }).parentElement)).toHaveStyle({
      height: '56px',
    })
    asRail.unmount()
    show('/dashboard', { mobile: true })
    expect(must(screen.getByRole('button', { name: 'Close sidebar' }).parentElement)).toHaveStyle({
      height: '56px',
    })
  })

  it('says it in Arabic too, with no raw key', async () => {
    await i18n.changeLanguage('ar')
    show()
    expect(
      screen.getByRole('button', { name: i18n.t('shell.collapseSidebar') }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: i18n.t('shell.mainNavigation') }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/shell\./)
  })
})

describe('right to left', () => {
  const chevron = (btn: HTMLElement) => btn.querySelector('polyline')?.getAttribute('points')

  it("draws the collapse chevron toward the sidebar's own edge: left in English, right in Arabic", async () => {
    const en = show()
    expect(chevron(screen.getByRole('button', { name: 'Collapse sidebar' }))).toBe(
      '15 18 9 12 15 6',
    )
    en.unmount()
    await i18n.changeLanguage('ar')
    show()
    expect(chevron(screen.getByRole('button', { name: i18n.t('shell.collapseSidebar') }))).toBe(
      '9 18 15 12 9 6',
    )
  })

  it('draws the expand chevron away from the edge in the rail and in a collapsed sidebar: right in English, left in Arabic', async () => {
    localStorage.setItem('fnc-sidebar-collapsed', 'true')
    const asRail = show('/dashboard', { rail: true })
    expect(chevron(screen.getByRole('button', { name: 'Expand sidebar' }))).toBe('9 18 15 12 9 6')
    asRail.unmount()
    const collapsed = show('/dashboard')
    expect(chevron(screen.getByRole('button', { name: 'Expand sidebar' }))).toBe('9 18 15 12 9 6')
    collapsed.unmount()
    await i18n.changeLanguage('ar')
    const arRail = show('/dashboard', { rail: true })
    expect(chevron(screen.getByRole('button', { name: i18n.t('shell.expandSidebar') }))).toBe(
      '15 18 9 12 15 6',
    )
    arRail.unmount()
    show('/dashboard')
    expect(chevron(screen.getByRole('button', { name: i18n.t('shell.expandSidebar') }))).toBe(
      '15 18 9 12 15 6',
    )
  })

  it("turns a closed group's chevron toward the side the pages are on: -90 degrees in English, 90 in Arabic", async () => {
    const turn = () => {
      const g = document.querySelector<HTMLElement>('button[aria-expanded="false"]')
      return g?.querySelector<HTMLElement>('span[aria-hidden="true"]:last-of-type')?.style.transform
    }
    const en = show('/dashboard')
    expect(turn()).toBe('rotate(-90deg)')
    en.unmount()
    await i18n.changeLanguage('ar')
    show('/dashboard')
    expect(turn()).toBe('rotate(90deg)')
  })

  it('opens a group to no rotation in both', async () => {
    await i18n.changeLanguage('ar')
    show('/reporting/executive')
    const g = document.querySelector<HTMLElement>('button[aria-controls]')
    expect(
      g?.querySelector<HTMLElement>('span[aria-hidden="true"]:last-of-type')?.style.transform,
    ).toBe('rotate(0deg)')
  })
})

describe('the keyboard', () => {
  it('draws a clear ring on a row reached with the keyboard, takes it off on blur, and none for a mouse click', () => {
    show()
    const row = link('Vendors')
    const spy = focusVisible(true)
    fireEvent.focus(row)
    expect(row.style.boxShadow).toBe(shellFocusRing(light))
    fireEvent.blur(row)
    expect(row.style.boxShadow).toBe('none')
    spy.mockRestore()
    focusVisible(false)
    fireEvent.focus(row)
    expect(row.style.boxShadow).toBe('none')
  })

  it('does the same on a group button', () => {
    show('/dashboard')
    const g = groupButton(/Reporting/)
    focusVisible(true)
    fireEvent.focus(g)
    expect(g.style.boxShadow).toBe(shellFocusRing(light))
  })

  it('can reach a group with the Tab key at all (it is a button now, not a div)', () => {
    show('/dashboard')
    const g = groupButton(/Reporting/)
    expect(g.tagName).toBe('BUTTON')
    expect(g).not.toHaveAttribute('tabindex', '-1')
  })
})

describe('the bottom of the sidebar', () => {
  it('opens Help through the global event, as a button', () => {
    const seen = vi.fn()
    window.addEventListener('fnc:open-help', seen)
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(seen).toHaveBeenCalledTimes(1)
    window.removeEventListener('fnc:open-help', seen)
  })

  it('tints Settings while you are in it, and only then', () => {
    const { unmount } = show('/settings/profile')
    expect(link('Settings')).toHaveStyle({ background: light.accentBg })
    unmount()
    show('/dashboard')
    expect(link('Settings')).toHaveStyle({ background: 'transparent' })
  })

  it('shows Admin to a system administrator only', () => {
    const { unmount } = show()
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
    unmount()
    setUser({ system_admin: true, role: 'system_admin' })
    show()
    expect(link('Admin')).toHaveAttribute('href', '/admin')
  })
})

describe('who sees which rows (unchanged: the same permission checks)', () => {
  it('shows a user only the groups their permissions reach, and the pages without a permission to everyone', () => {
    setUser({ role: 'user', permissions: { 'finance.accounts.view': 'view' } })
    show('/dashboard')
    expect(link('Dashboard')).toBeInTheDocument()
    expect(groupButton(/Journals & Accounts/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Receivables/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Inter-company/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
  })

  it('shows the pages of a group a user can open, and hides the ones they cannot', () => {
    setUser({ role: 'user', permissions: { 'finance.accounts.view': 'view' } })
    show('/finance/accounts')
    expect(link('Chart of Accounts')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Journal Entries' })).toBeNull()
  })

  it('shows an administrator every group', () => {
    show('/dashboard')
    expect(groupButton(/Receivables/)).toBeInTheDocument()
    expect(groupButton(/Inter-company/)).toBeInTheDocument()
  })
})

describe('the phone drawer', () => {
  it('is off-screen until it is opened, then slides in', () => {
    const { container, rerender } = show('/dashboard', { mobile: true, expanded: false })
    const root = container.firstChild as HTMLElement
    expect(root.style.transform).toBe('translateX(-100%)')
    rerender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ThemeProvider>
          <Sidebar mobile expanded />
        </ThemeProvider>
      </MemoryRouter>,
    )
    expect((container.firstChild as HTMLElement).style.transform).toBe('translateX(0)')
  })

  it('has a 40px close button, and closes when a page is chosen', () => {
    const onClose = vi.fn()
    show('/dashboard', { mobile: true, expanded: true, onClose })
    const close = screen.getByRole('button', { name: 'Close sidebar' })
    expect(close).toHaveStyle({ width: '40px', height: '40px' })
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(link('Vendors'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('draws taller rows for a finger: 48px for a page, 44px inside a group', () => {
    show('/reporting/executive', { mobile: true, expanded: true })
    expect(link('Dashboard')).toHaveStyle({ minHeight: '48px' })
    expect(link('Executive')).toHaveStyle({ minHeight: '44px' })
  })

  it('shows who is signed in, a Profile row, and a Sign out row in the danger colour', () => {
    setUser({ firstName: 'Fernando', lastName: 'Yousif', email: 'fernando@example.com' })
    show('/dashboard', { mobile: true, expanded: true })
    expect(screen.getByText('Fernando Yousif')).toBeInTheDocument()
    expect(screen.getByText('fernando@example.com')).toHaveStyle({ color: light.textSecondary })
    expect(link('Profile')).toHaveAttribute('href', '/settings/profile')
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveStyle({ color: light.danger })
  })

  it('signs out from the drawer', () => {
    show('/dashboard', { mobile: true, expanded: true })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('has no Profile or Sign out on a desktop (the top bar has the user menu)', () => {
    show('/dashboard')
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })
})

describe('the width and the collapse state (unchanged)', () => {
  it('is 220px open, 60px collapsed, and remembers the choice', () => {
    const { container } = show()
    const root = container.firstChild as HTMLElement
    expect(root.style.width).toBe('220px')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    })
    expect(root.style.width).toBe('60px')
    expect(localStorage.getItem('fnc-sidebar-collapsed')).toBe('true')
  })
})
