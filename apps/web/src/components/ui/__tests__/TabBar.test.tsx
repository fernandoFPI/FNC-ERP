// TabBar is shared by about twenty pages. `readable` is an opt-in for the redesigned procurement pages: without it nothing
// changes; with it the inactive tabs are in the readable grey (the pale one is 2.6:1 on white), the active tab is in the
// solid accent, and keyboard focus gets a ring.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { TabBar } from '../TabBar'

const theme = themes['light-flat']
const tabs = [
  { key: 'lines', label: 'Lines' },
  { key: 'log', label: 'Log' },
  { key: 'changes', label: 'Edit requests', badge: 2 },
]

function renderBar(readable?: boolean, onChange: (key: string) => void = () => undefined) {
  return render(
    <ThemeProvider>
      <TabBar tabs={tabs} active="lines" onChange={onChange} readable={readable} />
    </ThemeProvider>,
  )
}
const tab = (name: RegExp) => screen.getByRole('button', { name })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TabBar: the default look is unchanged', () => {
  it('keeps the pale inactive grey, the plain accent and the old sizes', () => {
    renderBar()
    expect(tab(/^Log/)).toHaveStyle({ color: theme.textMuted, fontSize: '13px', fontWeight: '400' })
    expect(tab(/^Lines/)).toHaveStyle({ color: theme.accent, fontWeight: '500' })
  })

  it('does not draw a focus ring', () => {
    renderBar()
    fireEvent.focus(tab(/^Log/))
    expect(tab(/^Log/).style.boxShadow).toBe('')
  })
})

describe('TabBar: readable', () => {
  it('draws the inactive tabs in the readable secondary grey', () => {
    renderBar(true)
    expect(tab(/^Log/)).toHaveStyle({ color: theme.textSecondary })
  })

  it('draws the active tab in the solid accent, semibold, with an underline of the same colour', () => {
    renderBar(true)
    const lines = tab(/^Lines/)
    expect(lines).toHaveStyle({ color: theme.accentSolid, fontWeight: '600' })
    expect(lines.style.borderBottom).toContain('2px solid')
    expect(lines.style.borderBottomColor.length).toBeGreaterThan(0)
  })

  it('is a size larger than the default', () => {
    renderBar(true)
    expect(tab(/^Log/)).toHaveStyle({ fontSize: '14px' })
  })

  it('darkens an inactive tab under the pointer and puts it back', () => {
    renderBar(true)
    const log = tab(/^Log/)
    fireEvent.mouseEnter(log)
    expect(log).toHaveStyle({ color: theme.textPrimary })
    fireEvent.mouseLeave(log)
    expect(log).toHaveStyle({ color: theme.textSecondary })
  })

  it('draws a ring for keyboard focus only, and takes it away on blur', () => {
    renderBar(true)
    const log = tab(/^Log/)
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called back with the element as `this` below
    const real = Element.prototype.matches
    // answer only :focus-visible; every other selector goes to the real implementation (testing-library needs it)
    const focusVisible = (answer: boolean) =>
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
        this: Element,
        sel: string,
      ) {
        return sel === ':focus-visible' ? answer : real.call(this, sel)
      })
    // a mouse click focuses without :focus-visible
    focusVisible(false)
    fireEvent.focus(log)
    expect(log.style.boxShadow).toBe('')
    vi.restoreAllMocks()
    focusVisible(true)
    fireEvent.focus(log)
    expect(log.style.boxShadow).toContain('inset 0 0 0 2px')
    fireEvent.blur(log)
    expect(log.style.boxShadow).toBe('none')
  })

  it('still reports the chosen tab and shows the count badge in the solid accent', () => {
    const onChange = vi.fn()
    renderBar(true, onChange)
    fireEvent.click(tab(/^Log/))
    expect(onChange).toHaveBeenCalledWith('log')
    expect(screen.getByText('2')).toHaveStyle({ color: theme.accentSolid })
  })
})
