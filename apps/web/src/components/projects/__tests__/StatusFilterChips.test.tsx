// The chips above a list on a project's Procurement tab. It only draws and reports clicks; the selection lives in the page.
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { StatusFilterChips } from '../StatusFilterChips'

const options = [
  { value: 'draft', label: 'Draft', count: 1 },
  { value: 'rejected', label: 'Rejected', count: 3 },
]
const onToggle = vi.fn<[string], unknown>()
const onClear = vi.fn()
function show(over: Partial<React.ComponentProps<typeof StatusFilterChips>> = {}) {
  return render(
    <ThemeProvider>
      <StatusFilterChips
        options={options}
        selected={[]}
        total={4}
        onToggle={onToggle}
        onClear={onClear}
        {...over}
      />
    </ThemeProvider>,
  )
}
const group = () => screen.getByRole('group', { name: 'Filter by status' })

afterEach(async () => {
  onToggle.mockClear()
  onClear.mockClear()
  if (i18n.language !== 'en') {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  }
})

describe('StatusFilterChips', () => {
  it('is a named group with an All chip carrying the total and a chip per status carrying its count', () => {
    show()
    const names = within(group())
      .getAllByRole('button')
      .map((b) => b.textContent.trim())
    expect(names).toEqual(['All 4', 'Draft 1', 'Rejected 3'])
  })

  it('marks All as pressed when nothing is ticked, and the ticked statuses otherwise', () => {
    const { unmount } = show()
    expect(screen.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rejected 3' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    unmount()
    show({ selected: ['rejected'] })
    expect(screen.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Rejected 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Draft 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a status chip reports its own status, and All clears', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Rejected 3' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('rejected')
    fireEvent.click(screen.getByRole('button', { name: 'All 4' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('draws nothing when there is nothing to choose between (one status, or none)', () => {
    const one = show({ options: [options[1]] })
    expect(one.container.textContent).toBe('')
    one.unmount()
    const none = show({ options: [] })
    expect(none.container.textContent).toBe('')
  })

  it('in Arabic the group name and the All chip are translated', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    show()
    const g = screen.getByRole('group', { name: 'تصفية حسب الحالة' })
    expect(within(g).getAllByRole('button')[0].textContent.trim()).toBe('الكل 4')
  })
})

describe('its strings exist in both languages', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../StatusFilterChips.tsx'), 'utf8')
  type Locale = Record<string, Record<string, Record<string, string> | undefined> | undefined>
  const load = (f: string) =>
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../i18n/locales', f), 'utf8'),
    ) as Locale

  it('resolves every key the component uses, in English and in Arabic', () => {
    const keys = [...new Set([...src.matchAll(/t\('([\w.]+)'/g)].map((m) => m[1]))]
    expect(keys.length).toBeGreaterThanOrEqual(2)
    for (const lang of ['en.json', 'ar.json']) {
      const json = load(lang)
      for (const k of keys) {
        const [a, b, c] = k.split('.')
        expect(json[a]?.[b]?.[c], `${lang} ${k}`).toBeTruthy()
      }
    }
  })
})
