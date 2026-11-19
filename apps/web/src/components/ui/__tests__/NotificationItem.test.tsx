// One row of the notifications list. It was a `div` with a click handler: a keyboard user could Tab past every
// notification and never open one. Its times were hard-coded English ("Just now", "5m ago") in the Arabic UI.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { themes } from '../../../theme/tokens'
import { NotificationItem } from '../NotificationItem'

const NOW = new Date(2026, 10, 17, 12, 0, 0)

function mount(over: Partial<React.ComponentProps<typeof NotificationItem>['notification']> = {}) {
  const onRead = vi.fn()
  const onNavigate = vi.fn()
  const notification = {
    id: 'n1',
    type: 'PO_APPROVAL_REQUIRED',
    title: 'PO needs approval',
    body: 'Requested by Ahmed',
    isRead: false,
    createdAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    ...over,
  }
  render(
    <ThemeProvider>
      <NotificationItem notification={notification} onRead={onRead} onNavigate={onNavigate} />
    </ThemeProvider>,
  )
  return { onRead, onNavigate, notification }
}
const row = () => screen.getByRole('button', { name: /PO needs approval/ })

// Say what the browser would answer for ":focus-visible", and leave every other selector alone.
const focusVisible = (answer: boolean) => {
  // Always called with the element as `this`, so reading it unbound is safe.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = Element.prototype.matches
  return vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':focus-visible' ? answer : original.call(this, selector)
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('NotificationItem: a row that opens something works without a mouse', () => {
  it('is a button in the Tab order', () => {
    mount()
    expect(row()).toHaveAttribute('tabindex', '0')
  })

  it('a click marks an unread one as read and opens it', () => {
    const { onRead, onNavigate, notification } = mount()
    fireEvent.click(row())
    expect(onRead).toHaveBeenCalledWith('n1')
    expect(onNavigate).toHaveBeenCalledWith(notification)
  })

  it('a click on one already read opens it without marking it again', () => {
    const { onRead, onNavigate } = mount({ isRead: true })
    fireEvent.click(row())
    expect(onRead).not.toHaveBeenCalled()
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it.each(['Enter', ' '])('the %j key does the same as a click', (key) => {
    const { onRead, onNavigate } = mount()
    fireEvent.keyDown(row(), { key })
    expect(onRead).toHaveBeenCalledWith('n1')
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('keeps Space from scrolling the list behind it', () => {
    mount()
    // fireEvent returns false when a handler called preventDefault
    expect(fireEvent.keyDown(row(), { key: ' ' })).toBe(false)
  })

  it('ignores every other key, so Tab and typing pass through', () => {
    const { onRead, onNavigate } = mount()
    for (const key of ['Tab', 'a', 'ArrowDown', 'Escape']) fireEvent.keyDown(row(), { key })
    expect(onRead).not.toHaveBeenCalled()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('draws a ring inside the row for keyboard focus, and nothing after a mouse click', () => {
    focusVisible(true)
    mount()
    fireEvent.focus(row())
    expect(row().style.boxShadow).toContain('inset')
    fireEvent.blur(row())
    expect(row().style.boxShadow).toBe('none')
    focusVisible(false)
    fireEvent.focus(row())
    expect(row().style.boxShadow).toBe('none')
  })

  it('draws the unread dot on an unread row only', () => {
    const unread = mount()
    expect(row().querySelectorAll('div[style*="border-radius: 50%"]')).toHaveLength(1)
    expect(unread.notification.isRead).toBe(false)
  })

  it('draws no unread dot on a read row', () => {
    mount({ isRead: true })
    expect(row().querySelectorAll('div[style*="border-radius: 50%"]')).toHaveLength(0)
  })
})

describe('NotificationItem: the time', () => {
  const at = (ms: number) => ({ createdAt: new Date(NOW.getTime() - ms).toISOString() })
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR
  const time = () => row().querySelector('span')

  it.each([
    [10_000, 'Just now'],
    [5 * MIN, '5m ago'],
    [3 * HOUR, '3h ago'],
    [30 * HOUR, 'Yesterday'],
    [3 * DAY, '3d ago'],
  ])('%i ms ago reads %s in English', (ms, text) => {
    mount(at(ms))
    expect(time()).toHaveTextContent(text)
  })

  it.each([
    [10_000, 'الآن'],
    [5 * MIN, 'منذ 5 د'],
    [3 * HOUR, 'منذ 3 س'],
    [30 * HOUR, 'أمس'],
    [3 * DAY, 'منذ 3 ي'],
  ])('%i ms ago reads %s in Arabic, not in English', async (ms, text) => {
    await i18n.changeLanguage('ar')
    mount(at(ms))
    expect(time()).toHaveTextContent(text)
  })

  it('shows a date, not "40d ago", after a month', () => {
    mount(at(40 * DAY))
    expect(time()?.textContent).not.toMatch(/ago/)
  })

  it('is drawn in the readable grey (the pale one is 2.6:1)', () => {
    mount()
    expect(time()).toHaveStyle({ color: themes['light-flat'].textSecondary })
  })
})
