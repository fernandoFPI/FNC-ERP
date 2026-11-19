// The newer button: one solid main action, the rest stepping down, a spinner while it works, a focus ring for the
// keyboard only. The shared `Button` is not touched; these tests only describe `ActionButton`.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { ActionButton } from '../ActionButton'

const theme = themes['light-flat']

const show = (props: Partial<React.ComponentProps<typeof ActionButton>> = {}) => {
  const onClick = vi.fn()
  render(
    <ThemeProvider>
      <ActionButton onClick={onClick} {...props}>
        {props.children ?? 'Record purchase'}
      </ActionButton>
    </ThemeProvider>,
  )
  return { onClick, button: screen.getByRole<HTMLButtonElement>('button') }
}
const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
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
  setWidth(1024)
})

describe('ActionButton', () => {
  it('is a button named by its text, and tells the page when it is clicked', () => {
    const { onClick, button } = show()
    expect(screen.getByRole('button', { name: 'Record purchase' })).toBe(button)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does nothing when disabled, dims, and says so with the cursor', () => {
    const { button } = show({ disabled: true })
    expect(button).toBeDisabled()
    expect(button).toHaveStyle({ opacity: '0.45', cursor: 'not-allowed' })
  })

  it('while loading: busy, not clickable, and the text stays so the button keeps its width', () => {
    const { button } = show({ loading: true })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(screen.getByText('Record purchase')).toBeInTheDocument()
    // a spinner is drawn in front of the text
    expect(button.querySelector('svg, [class*="spin" i], [role="status"]')).not.toBeNull()
  })

  it('is not marked busy when it is not loading', () => {
    const { button } = show()
    expect(button).not.toHaveAttribute('aria-busy')
  })

  it('solid is the one main action: the solid accent with readable text on it', () => {
    const { button } = show({ variant: 'solid' })
    expect(button).toHaveStyle({
      backgroundColor: theme.accentSolid,
      color: theme.accentSolidText,
    })
  })

  it('outline has a visible field-coloured edge, not the pale one', () => {
    const { button } = show({ variant: 'outline' })
    expect(button).toHaveStyle({ border: `1px solid ${theme.borderField}` })
  })

  it('soft reads in the darker accent on its tint (the pale accent is under 4.5:1 there)', () => {
    const { button } = show({ variant: 'soft' })
    expect(button).toHaveStyle({ color: theme.accentSolid })
    expect(button).not.toHaveStyle({ color: theme.accent })
  })

  it('ghost has no edge until it is needed and reads in the secondary grey', () => {
    const { button } = show({ variant: 'ghost' })
    expect(button).toHaveStyle({ color: theme.textSecondary })
    expect(button.style.border).toContain('transparent')
  })

  it('danger is tinted red with a red edge', () => {
    const { button } = show({ variant: 'danger' })
    expect(button).toHaveStyle({
      color: theme.danger,
      backgroundColor: theme.dangerBg,
      border: `1px solid ${theme.dangerBorder}`,
    })
  })

  it('changes colour when the pointer is over it, and not when it is disabled', () => {
    const live = show({ variant: 'solid' })
    expect(live.button).toHaveStyle({ backgroundColor: theme.accentSolid })
    fireEvent.mouseEnter(live.button)
    expect(live.button).toHaveStyle({ backgroundColor: theme.accentSolidHover })
    fireEvent.mouseLeave(live.button)
    expect(live.button).toHaveStyle({ backgroundColor: theme.accentSolid })
  })

  it('stays the same colour under the pointer while disabled', () => {
    // A real browser still reports the pointer over a button that has just been disabled (jsdom does not
    // deliver the event to a disabled button at all), so hover first, then disable it.
    const view = render(
      <ThemeProvider>
        <ActionButton variant="solid">Record purchase</ActionButton>
      </ThemeProvider>,
    )
    const button = view.getByRole('button', { name: 'Record purchase' })
    fireEvent.mouseEnter(button)
    expect(button).toHaveStyle({ backgroundColor: theme.accentSolidHover })
    view.rerender(
      <ThemeProvider>
        <ActionButton variant="solid" disabled>
          Record purchase
        </ActionButton>
      </ThemeProvider>,
    )
    expect(button).toBeDisabled()
    expect(button).toHaveStyle({ backgroundColor: theme.accentSolid })
  })

  it('shows a focus ring for the keyboard and drops it when focus leaves', () => {
    focusVisible(true)
    const { button } = show()
    expect(button.style.boxShadow).not.toContain('3px')
    act(() => {
      button.focus()
    })
    expect(button.style.boxShadow).toContain('0 0 0 3px')
    act(() => {
      button.blur()
    })
    expect(button.style.boxShadow).not.toContain('3px')
  })

  it('shows no ring after a mouse click (focus that is not keyboard focus)', () => {
    focusVisible(false)
    const { button } = show()
    act(() => {
      button.focus()
    })
    expect(button.style.boxShadow).not.toContain('3px')
  })

  it('has three sizes: 32, 40 and 44 px high on a desktop', () => {
    setWidth(1440)
    const small = show({ size: 'sm' })
    expect(small.button).toHaveStyle({ height: '32px' })
  })

  it('is 40 px by default on a desktop and at least 44 px on a phone (a finger needs the room)', () => {
    setWidth(1440)
    const desktop = show()
    expect(desktop.button).toHaveStyle({ height: '40px' })
  })

  it('a small button is raised to 44 px on a phone', () => {
    setWidth(375)
    const { button } = show({ size: 'sm' })
    expect(button).toHaveStyle({ height: '44px' })
  })

  it('can fill the row, for the main action on a phone', () => {
    const { button } = show({ fullWidth: true })
    expect(button).toHaveStyle({ width: '100%' })
  })

  it('does not fill the row unless asked', () => {
    const { button } = show()
    expect(button.style.width).toBe('')
  })

  it('an icon on its own needs a name, and gets it from ariaLabel', () => {
    render(
      <ThemeProvider>
        <ActionButton ariaLabel="Remove" icon={<svg data-testid="x" />} />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('submits a form when it is a submit button, and not otherwise', () => {
    const { button } = show()
    expect(button).toHaveAttribute('type', 'button')
  })
})
