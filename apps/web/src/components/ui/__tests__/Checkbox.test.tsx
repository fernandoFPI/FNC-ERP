// The checkbox the app draws itself (the browser's own box is not used). Its real input stays in the page
// and in the Tab order, only unseen, so a keyboard or a screen reader can use it.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { Checkbox } from '../Checkbox'

const show = (props: Partial<React.ComponentProps<typeof Checkbox>> = {}) => {
  const onChange = vi.fn()
  const { container } = render(
    <ThemeProvider>
      <Checkbox label="Same vendor for all" onChange={onChange} {...props} />
    </ThemeProvider>,
  )
  return { onChange, container, input: screen.getByRole<HTMLInputElement>('checkbox') }
}
const box = (container: HTMLElement) => container.querySelector<HTMLElement>('span[aria-hidden]')
// Say what the browser would answer for ":focus-visible", and leave every other selector alone (the
// role queries need the real `matches`).
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

describe('Checkbox', () => {
  it('is a real checkbox with the label as its name, so it can be found and read aloud', () => {
    const { input } = show()
    expect(screen.getByRole('checkbox', { name: 'Same vendor for all' })).toBe(input)
    expect(input).not.toBeChecked()
  })

  it('stays in the Tab order: the input is not taken out of the page', () => {
    const { input } = show()
    expect(input).not.toHaveStyle({ display: 'none' })
    expect(input).not.toHaveAttribute('tabindex', '-1')
    input.focus()
    expect(input).toHaveFocus()
  })

  it('tells the page the new state when clicked, in either direction', () => {
    const first = show()
    fireEvent.click(first.input)
    expect(first.onChange).toHaveBeenLastCalledWith(true)
  })

  it('unticks from a ticked state', () => {
    const { onChange, input } = show({ checked: true })
    expect(input).toBeChecked()
    fireEvent.click(input)
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('can be toggled by clicking its label text, as people expect', () => {
    const { onChange } = show()
    fireEvent.click(screen.getByText('Same vendor for all'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('draws the app’s own box, plain when not ticked: a neutral border and no tick', () => {
    const { container } = show()
    expect(box(container)).toHaveStyle({ borderRadius: '4px' })
    expect(box(container)?.querySelector('svg')).toBeNull()
    expect(box(container)).toHaveStyle({
      border: `1.5px solid ${themes['light-flat'].borderInput}`,
    })
  })

  it('draws the tick and an accent border when ticked', () => {
    const { container, input } = show({ checked: true })
    expect(input).toBeChecked()
    expect(box(container)?.querySelector('svg')).not.toBeNull()
    expect(box(container)).toHaveStyle({ border: `1.5px solid ${themes['light-flat'].accent}` })
  })

  it('shows a focus ring when reached by the keyboard, and drops it when focus leaves', () => {
    // jsdom has no keyboard-versus-mouse notion: say the browser would call this focus visible
    focusVisible(true)
    const { container, input } = show()
    expect(box(container)?.style.outline).toBe('none')
    act(() => {
      input.focus()
    })
    expect(box(container)?.style.outline).toContain('2px solid')
    act(() => {
      input.blur()
    })
    expect(box(container)?.style.outline).toBe('none')
  })

  it('shows no ring when it was clicked with a mouse (focus that is not keyboard focus)', () => {
    focusVisible(false)
    const { container, input } = show()
    act(() => {
      input.focus()
    })
    expect(box(container)?.style.outline).toBe('none')
  })

  it('does nothing when disabled, and says so with the cursor', () => {
    const { input } = show({ disabled: true })
    expect(input).toBeDisabled()
    expect(screen.getByText('Same vendor for all').closest('label')?.style.cursor).toBe(
      'not-allowed',
    )
  })

  it('reads its label in the readable grey, not the pale one', () => {
    show()
    const label = screen.getByText('Same vendor for all').closest('label')
    expect(label).toHaveStyle({ color: themes['light-flat'].textSecondary })
    expect(label).not.toHaveStyle({ color: themes['light-flat'].textMuted })
  })
})

// A tick box in a table row has no visible label: it needs a name for a screen reader, and on a phone a bigger box and tap
// area (the Record Goods Receipt lines).
describe('Checkbox without a visible label, and the large size', () => {
  it('is named by ariaLabel when there is no label text', () => {
    render(
      <ThemeProvider>
        <Checkbox ariaLabel="Receive AC cover" />
      </ThemeProvider>,
    )
    expect(screen.getByRole('checkbox', { name: 'Receive AC cover' })).toBeInTheDocument()
  })

  it('draws a 16px box by default and a 22px box with a bigger tap area when large', () => {
    const { container, rerender } = render(
      <ThemeProvider>
        <Checkbox ariaLabel="a" />
      </ThemeProvider>,
    )
    const box = () => container.querySelector<HTMLElement>('span[aria-hidden]')
    const label = () => container.querySelector<HTMLElement>('label')
    expect(box()).toHaveStyle({ width: '16px', height: '16px' })
    expect(label()?.style.padding).toBe('')
    rerender(
      <ThemeProvider>
        <Checkbox ariaLabel="a" large />
      </ThemeProvider>,
    )
    expect(box()).toHaveStyle({ width: '22px', height: '22px' })
    // the label is the tap target: 22 + 2 x 10 = 42px
    expect(label()).toHaveStyle({ padding: '10px' })
  })

  it('still toggles from the keyboard and reports the new state when large', () => {
    const onChange = vi.fn()
    render(
      <ThemeProvider>
        <Checkbox ariaLabel="a" large onChange={onChange} />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'a' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

// "Some are selected": the select-all box of a list when part of the list is ticked.
describe('Checkbox: indeterminate', () => {
  const mark = (container: HTMLElement) => box(container)?.querySelector('path')?.getAttribute('d')

  it('tells the browser and a screen reader it is neither on nor off, and draws a dash', () => {
    const { input, container } = show({ indeterminate: true })
    expect(input.indeterminate).toBe(true)
    expect(input).not.toBeChecked()
    expect(mark(container)).toBe('M1 1h8')
  })

  it('is an ordinary unticked box without it: no dash, not indeterminate', () => {
    const { input, container } = show()
    expect(input.indeterminate).toBe(false)
    expect(mark(container)).toBeUndefined()
  })

  it('shows the tick, not the dash, once everything is ticked', () => {
    const { input, container } = show({ indeterminate: true, checked: true })
    expect(input.indeterminate).toBe(false)
    expect(input).toBeChecked()
    expect(mark(container)).toBe('M1 4l3 3 5-6')
  })

  it('stops being indeterminate when the page says so', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ThemeProvider>
        <Checkbox ariaLabel="all" indeterminate onChange={onChange} />
      </ThemeProvider>,
    )
    const input = screen.getByRole<HTMLInputElement>('checkbox', { name: 'all' })
    expect(input.indeterminate).toBe(true)
    rerender(
      <ThemeProvider>
        <Checkbox ariaLabel="all" indeterminate={false} onChange={onChange} />
      </ThemeProvider>,
    )
    expect(input.indeterminate).toBe(false)
  })

  it('draws the box in the accent edge, like a ticked one, and a plain one in the input edge', () => {
    const mixed = show({ indeterminate: true })
    expect(box(mixed.container)).toHaveStyle({
      border: `1.5px solid ${themes['light-flat'].accent}`,
    })
    cleanup()
    const plain = show()
    expect(box(plain.container)).toHaveStyle({
      border: `1.5px solid ${themes['light-flat'].borderInput}`,
    })
  })

  it('a press while indeterminate asks to turn it on', () => {
    const { onChange, input } = show({ indeterminate: true })
    fireEvent.click(input)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
