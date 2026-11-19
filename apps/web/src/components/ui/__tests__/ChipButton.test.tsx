// A small rounded button for a quick pick or a quick add.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { ChipButton } from '../ChipButton'

const theme = themes['light-flat']

const show = (props: Partial<React.ComponentProps<typeof ChipButton>> = {}) => {
  const onClick = vi.fn()
  render(
    <ThemeProvider>
      <ChipButton onClick={onClick} {...props}>
        Cash
      </ChipButton>
    </ThemeProvider>,
  )
  return { onClick, chip: screen.getByRole<HTMLButtonElement>('button', { name: 'Cash' }) }
}
// Say what the browser would answer for ":focus-visible" and leave every other selector alone.
const focusVisible = (answer: boolean) => {
  // Always called with the element as `this` (original.call below), so reading it unbound is safe.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = Element.prototype.matches
  return vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':focus-visible' ? answer : original.call(this, selector)
  })
}
afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChipButton', () => {
  it('is a button that tells the page when it is clicked', () => {
    const { chip, onClick } = show()
    fireEvent.click(chip)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is not a toggle unless it is given a selected state: no aria-pressed at all', () => {
    const { chip } = show()
    expect(chip).not.toHaveAttribute('aria-pressed')
  })

  it('a choice that is not picked says so: aria-pressed false, no tick', () => {
    const { chip } = show({ selected: false })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip.querySelector('svg')).toBeNull()
  })

  it('the picked choice says so: aria-pressed true, a tick, the accent edge and tint', () => {
    const { chip } = show({ selected: true })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip.querySelector('svg')).not.toBeNull()
    expect(chip).toHaveStyle({
      border: `1px solid ${theme.accent}`,
      backgroundColor: theme.accentBg,
    })
  })

  it('reads in the darker accent when picked (the pale one is under 4.5:1 on its tint)', () => {
    const { chip } = show({ selected: true })
    expect(chip).toHaveStyle({ color: theme.accentSolid })
    expect(chip).not.toHaveStyle({ color: theme.accent })
  })

  it('an unpicked chip reads in the primary text colour with a firm edge', () => {
    const { chip } = show({ selected: false })
    expect(chip).toHaveStyle({
      color: theme.textPrimary,
      border: `1px solid ${theme.borderStrong}`,
    })
  })

  it('a chip that adds something is dashed and in the accent, and is not a toggle', () => {
    const { chip } = show({ dashed: true })
    expect(chip.style.border).toContain('dashed')
    expect(chip).toHaveStyle({ color: theme.accentSolid })
    expect(chip).not.toHaveAttribute('aria-pressed')
  })

  it('does nothing when disabled', () => {
    const { chip } = show({ disabled: true })
    expect(chip).toBeDisabled()
    expect(chip).toHaveStyle({ opacity: '0.5', cursor: 'not-allowed' })
  })

  it('shows a focus ring for the keyboard only', () => {
    focusVisible(true)
    const { chip } = show()
    expect(chip.style.boxShadow).toBe('none')
    act(() => {
      chip.focus()
    })
    expect(chip.style.boxShadow).toContain('0 0 0 3px')
    act(() => {
      chip.blur()
    })
    expect(chip.style.boxShadow).toBe('none')
  })

  it('shows no ring after a mouse click', () => {
    focusVisible(false)
    const { chip } = show()
    act(() => {
      chip.focus()
    })
    expect(chip.style.boxShadow).toBe('none')
  })

  it('is 30 px high on a desktop and 36 px on a phone', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
    const { chip } = show()
    expect(chip).toHaveStyle({ height: '30px' })
  })

  it('is 36 px high on a phone', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true, writable: true })
    const { chip } = show()
    expect(chip).toHaveStyle({ height: '36px' })
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true })
  })
})
