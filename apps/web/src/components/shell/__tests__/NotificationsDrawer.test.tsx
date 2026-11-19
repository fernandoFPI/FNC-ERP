// The notifications drawer is a shared Drawer. Its "unread" section heading asked the translation for a `{{count}}`
// string without giving it a count, so the heading printed the raw placeholder ("{{COUNT}} UNREAD") above a badge that
// already showed the number. The heading is now its own string ("Unread").
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { useNotificationStore } from '../../../store/notificationStore'
import { NotificationsDrawer } from '../NotificationsDrawer'

vi.mock('../../../lib/axios', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  },
}))

const seed = [
  {
    id: 'n1',
    type: 'PO_COMPLETED',
    title: 'PO done',
    body: 'Done',
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    type: 'PO_COMPLETED',
    title: 'PO old',
    body: 'Old',
    isRead: true,
    createdAt: new Date().toISOString(),
  },
]

beforeEach(() => {
  act(() => {
    useNotificationStore.setState({ notifications: seed, unreadCount: 1 })
  })
})
afterEach(async () => {
  document.body.style.overflow = ''
  await i18n.changeLanguage('en')
  act(() => {
    useNotificationStore.setState({ notifications: [], unreadCount: 0 })
  })
})

function show() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <NotificationsDrawer open onClose={() => undefined} />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('NotificationsDrawer', () => {
  it('is a named dialog', () => {
    show()
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveAttribute(
      'aria-modal',
      'true',
    )
  })

  it('titles the unread section "Unread", never with a raw placeholder', () => {
    const { baseElement } = show()
    expect(screen.getByText('Unread')).toBeInTheDocument()
    expect(baseElement.textContent).not.toMatch(/\{\{/)
  })

  it('does the same in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const { baseElement } = show()
    expect(screen.getByText(i18n.t('shell.notifDrawer.unreadSection'))).toBeInTheDocument()
    expect(i18n.t('shell.notifDrawer.unreadSection')).not.toBe('shell.notifDrawer.unreadSection')
    expect(baseElement.textContent).not.toMatch(/\{\{/)
  })

  it('keeps the title level with the close button (no description under it)', () => {
    show()
    const header = screen.getByRole('heading', { name: 'Notifications' }).parentElement
      ?.parentElement
    expect(header).toHaveStyle({ alignItems: 'center' })
  })
})
