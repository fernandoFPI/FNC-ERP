// The language button names the OTHER language in that language (so a screen reader reads it right), and the phone's bottom bar uses the
// readable grey for the pages you are not on, the solid accent for the one you are on, and says which that is.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import i18n from '../../../i18n'
import { useNotificationStore } from '../../../store/notificationStore'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { BottomNav } from '../BottomNav'

const light = themes['light-flat']

beforeEach(() => {
  localStorage.clear()
  useNotificationStore.setState({ unreadCount: 0 })
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('LanguageSwitcher', () => {
  const show = () =>
    render(
      <ThemeProvider>
        <LanguageSwitcher />
      </ThemeProvider>,
    )

  it('shows the Arabic name while the page is in English, marked as Arabic text', () => {
    show()
    const b = screen.getByRole('button', { name: 'Switch language' })
    expect(b).toHaveTextContent('عربي')
    expect(b.querySelector('span')).toHaveAttribute('lang', 'ar')
  })

  it('switches to Arabic on a press, and then offers EN, marked as English', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
    await screen.findByRole('button', { name: i18n.t('common.switchLanguage') })
    expect(i18n.resolvedLanguage).toBe('ar')
    const b = screen.getByRole('button', { name: i18n.t('common.switchLanguage') })
    expect(b).toHaveTextContent('EN')
    expect(b.querySelector('span')).toHaveAttribute('lang', 'en')
  })

  it('switches back to English from Arabic', async () => {
    await i18n.changeLanguage('ar')
    show()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.switchLanguage') }))
    await screen.findByRole('button', { name: 'Switch language' })
    expect(i18n.resolvedLanguage).toBe('en')
  })
})

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}

describe('BottomNav', () => {
  const show = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <BottomNav />
        </ThemeProvider>
      </MemoryRouter>,
    )

  it('says which page you are on with aria-current, and only that one', () => {
    show('/procurement/purchase-orders')
    expect(screen.getByRole('button', { name: /PO/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /Home/ })).not.toHaveAttribute('aria-current')
  })

  it('draws the page you are on in the solid accent and the others in the readable grey, never the pale one', () => {
    show('/procurement/purchase-orders')
    expect(screen.getByRole('button', { name: /PO/ })).toHaveStyle({ color: light.accentSolid })
    for (const name of [/Home/, /Projects/, /Notifs/, /More/]) {
      const b = screen.getByRole('button', { name })
      expect(b).toHaveStyle({ color: light.textSecondary })
      expect(b).not.toHaveStyle({ color: light.textMuted })
    }
  })

  it('is a navigation bar of plain buttons that never submit a form', () => {
    show('/dashboard')
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAttribute('type', 'button')
  })

  it('shows a dot on the bell while something is unread', () => {
    useNotificationStore.setState({ unreadCount: 2 })
    show('/dashboard')
    const bell = screen.getByRole('button', { name: /Notifs/ })
    expect(bell.querySelector('div[style*="border-radius: 50%"]')).not.toBeNull()
  })

  it('goes to the page a button names, from wherever you are', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <ThemeProvider>
          <BottomNav />
          <Where />
        </ThemeProvider>
      </MemoryRouter>,
    )
    const goes: [RegExp, string][] = [
      [/Home/, '/dashboard'],
      [/Projects/, '/projects'],
      [/PO/, '/procurement/purchase-orders'],
      [/Notifs/, '/notifications'],
    ]
    for (const [name, path] of goes) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(screen.getByTestId('where')).toHaveTextContent(path)
    }
  })

  it('opens the sidebar drawer from More', () => {
    const seen: Event[] = []
    const on = (e: Event) => seen.push(e)
    window.addEventListener('fnc:open-sidebar', on)
    show('/dashboard')
    fireEvent.click(screen.getByRole('button', { name: /More/ }))
    expect(seen).toHaveLength(1)
    window.removeEventListener('fnc:open-sidebar', on)
  })
})
