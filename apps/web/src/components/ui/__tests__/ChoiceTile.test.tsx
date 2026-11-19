// An on/off choice drawn as a tile. It is still a checkbox for the keyboard and a screen reader; the tile, the
// tick and what it opens are only how it looks.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { ChoiceTile } from '../ChoiceTile'

const theme = themes['light-flat']

const show = (props: Partial<React.ComponentProps<typeof ChoiceTile>> = {}) => {
  const onChange = vi.fn()
  const { container } = render(
    <ThemeProvider>
      <ChoiceTile
        title="All items are from the same vendor"
        description="Choose the vendor once instead of on every line."
        icon={<svg data-testid="icon" />}
        checked={false}
        onChange={onChange}
        {...props}
      >
        {props.children ?? <button type="button">Inside the tile</button>}
      </ChoiceTile>
    </ThemeProvider>,
  )
  return {
    onChange,
    container,
    tile: container.firstElementChild as HTMLElement,
    box: screen.getByRole<HTMLButtonElement>('checkbox'),
  }
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

describe('ChoiceTile', () => {
  it('is a real checkbox named by the title, with the reason as its description', () => {
    const { box } = show()
    expect(screen.getByRole('checkbox', { name: 'All items are from the same vendor' })).toBe(box)
    expect(box).toHaveAccessibleDescription('Choose the vendor once instead of on every line.')
  })

  it('can be found by its title as a label (what the page tests and assistive tools use)', () => {
    const { box } = show()
    expect(screen.getByLabelText(/all items are from the same vendor/i)).toBe(box)
  })

  it('is a plain button that stays in the Tab order', () => {
    const { box } = show()
    expect(box.tagName).toBe('BUTTON')
    expect(box).toHaveAttribute('type', 'button')
    expect(box).not.toHaveAttribute('tabindex', '-1')
    box.focus()
    expect(box).toHaveFocus()
  })

  it('says off and on through aria-checked', () => {
    const off = show()
    expect(off.box).toHaveAttribute('aria-checked', 'false')
    off.container.remove()
    const on = show({ checked: true })
    expect(on.box).toHaveAttribute('aria-checked', 'true')
  })

  it('tells the page the new state when tapped, in either direction', () => {
    const off = show()
    fireEvent.click(off.box)
    expect(off.onChange).toHaveBeenCalledWith(true)
    off.container.remove()
    const on = show({ checked: true })
    fireEvent.click(on.box)
    expect(on.onChange).toHaveBeenCalledWith(false)
  })

  it('the whole header is the tap target: the title, the reason and the tick all toggle it', () => {
    const { onChange } = show()
    fireEvent.click(screen.getByText('All items are from the same vendor'))
    fireEvent.click(screen.getByText('Choose the vendor once instead of on every line.'))
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('off: a firm edge on the plain surface and an empty round tick', () => {
    const { tile } = show()
    expect(tile).toHaveStyle({
      border: `1.5px solid ${theme.borderStrong}`,
      backgroundColor: theme.bgSurface,
    })
    const tick = tile.querySelector('[data-tick]')
    expect(tick).toHaveAttribute('data-tick', 'off')
    expect(tick?.querySelector('svg')).toBeNull()
  })

  it('on: the accent edge and tint, and the tick filled with a check', () => {
    const { tile } = show({ checked: true })
    expect(tile).toHaveStyle({
      border: `1.5px solid ${theme.accentSolid}`,
      backgroundColor: theme.accentBg,
    })
    const tick = tile.querySelector('[data-tick]')
    expect(tick).toHaveAttribute('data-tick', 'on')
    expect(tick?.querySelector('svg')).not.toBeNull()
    expect(tick).toHaveStyle({ backgroundColor: theme.accentSolid, color: theme.accentSolidText })
  })

  it('the empty tick has the readable field edge, not the pale one', () => {
    const { tile } = show()
    expect(tile.querySelector('[data-tick]')).toHaveStyle({
      border: `1.5px solid ${theme.borderField}`,
    })
  })

  it('shows what it opens only while it is on', () => {
    const off = show()
    expect(screen.queryByText('Inside the tile')).toBeNull()
    off.container.remove()
    show({ checked: true })
    expect(screen.getByText('Inside the tile')).toBeInTheDocument()
  })

  it('what it opens is not part of the checkbox: using it does not switch the tile off', () => {
    const { onChange } = show({ checked: true })
    fireEvent.click(screen.getByText('Inside the tile'))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Inside the tile').closest('[role="checkbox"]')).toBeNull()
  })

  it('draws the icon for the eye only, so a screen reader reads the title and not the picture', () => {
    show()
    expect(screen.getByTestId('icon').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('works without an icon or a reason', () => {
    render(
      <ThemeProvider>
        <ChoiceTile title="Plain" checked={false} onChange={vi.fn()} />
      </ThemeProvider>,
    )
    const box = screen.getByRole('checkbox', { name: 'Plain' })
    expect(box).not.toHaveAttribute('aria-describedby')
  })

  it('reads the reason in the readable grey, not the pale one', () => {
    show()
    const reason = screen.getByText('Choose the vendor once instead of on every line.')
    expect(reason).toHaveStyle({ color: theme.textSecondary })
    expect(reason).not.toHaveStyle({ color: theme.textMuted })
  })

  it('tints a tile that is off when the pointer is over it, and not one that is on', () => {
    const off = show()
    expect(off.tile).toHaveStyle({ backgroundColor: theme.bgSurface })
    fireEvent.mouseEnter(off.box)
    expect(off.tile).toHaveStyle({ backgroundColor: theme.bgSurfaceHover })
    fireEvent.mouseLeave(off.box)
    expect(off.tile).toHaveStyle({ backgroundColor: theme.bgSurface })
    off.container.remove()
    const on = show({ checked: true })
    fireEvent.mouseEnter(on.box)
    expect(on.tile).toHaveStyle({ backgroundColor: theme.accentBg })
  })

  it('when disabled it cannot be changed, and says so', () => {
    const { box, tile, onChange } = show({ disabled: true })
    expect(box).toBeDisabled()
    expect(tile).toHaveStyle({ opacity: '0.55' })
    fireEvent.click(box)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows a focus ring for the keyboard and drops it when focus leaves', () => {
    focusVisible(true)
    const { box } = show()
    expect(box.style.boxShadow).toBe('none')
    act(() => {
      box.focus()
    })
    expect(box.style.boxShadow).toContain('0 0 0 3px')
    act(() => {
      box.blur()
    })
    expect(box.style.boxShadow).toBe('none')
  })

  it('shows no ring after a mouse click', () => {
    focusVisible(false)
    const { box } = show()
    act(() => {
      box.focus()
    })
    expect(box.style.boxShadow).toBe('none')
  })
})
