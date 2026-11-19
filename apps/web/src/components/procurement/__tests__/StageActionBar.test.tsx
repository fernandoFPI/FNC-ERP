// The bar at the bottom of the requisition page that holds the step's one action.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { StageActionBar } from '../StageActionBar'

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
})

const show = (props: Partial<React.ComponentProps<typeof StageActionBar>> = {}) =>
  render(
    <ThemeProvider>
      <StageActionBar title="Next step: market pricing" hint="Enter the quote per line" {...props}>
        <button type="button">Submit</button>
      </StageActionBar>
    </ThemeProvider>,
  )
const bar = () => screen.getByRole('region', { name: 'Next step: market pricing' })

describe('StageActionBar', () => {
  it('names the step, says what it does, and holds the buttons', () => {
    show()
    expect(within(bar()).getByText('Next step: market pricing')).toBeInTheDocument()
    expect(within(bar()).getByText('Enter the quote per line')).toBeInTheDocument()
    expect(within(bar()).getByRole('button', { name: 'Submit' })).toBeInTheDocument()
  })

  it('shows what the step is waiting on, next to the buttons', () => {
    show({ status: <span>Enter a price for every line</span> })
    expect(within(bar()).getByText('Enter a price for every line')).toBeInTheDocument()
  })

  it('on a desktop it sticks to the bottom of the window while the lines scroll', () => {
    show()
    expect(bar()).toHaveStyle({ position: 'sticky' })
    expect(bar().style.bottom).toBe('12px')
  })

  it('draws a plain explanation, with no empty button area, when the viewer has nothing to press', () => {
    render(
      <ThemeProvider>
        <StageActionBar
          title="Next step: market pricing"
          status={<span>Only a procurement officer can price</span>}
        />
      </ThemeProvider>,
    )
    expect(within(bar()).getByText('Only a procurement officer can price')).toBeInTheDocument()
    expect(within(bar()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('on a phone it is fixed above the bottom navigation and keeps the hint behind the info button', () => {
    setWidth(390)
    show()
    expect(bar()).toHaveStyle({ position: 'fixed', left: '0px', right: '0px' })
    expect(bar().style.bottom).toContain('64px')
    expect(within(bar()).queryByText('Enter the quote per line')).not.toBeInTheDocument()
    // The buttons share one row of a grid (two side by side, one across the whole width), not a stack of full-width bars.
    const buttons = within(bar()).getByRole('button', { name: 'Submit' }).parentElement
    if (!buttons) throw new Error('the buttons area was not found')
    expect(buttons.style.display).toBe('grid')
    expect(buttons.style.gridTemplateColumns).toContain('auto-fit')
  })

  it('on a phone nothing in the bar has a flex-basis in pixels (a height in a column)', () => {
    // Found on a real phone: the bar was a mostly empty panel because its text block had `flex: 1 1 320px`, which in
    // the bar's column is 320px of height. The bar now lays its text out in a row with the info button.
    setWidth(390)
    show({ status: <span>One line is still missing</span>, more: <span>How the step works</span> })
    expect(bar().style.flexDirection).toBe('column')
    const everyElement = [bar(), ...Array.from(bar().querySelectorAll<HTMLElement>('*'))]
    for (const el of everyElement) expect(el.style.flexBasis).not.toMatch(/px$/)
  })

  it('on a phone the info button opens the hint and the longer explanation, and closes them again', () => {
    setWidth(390)
    show({ more: <span>Who has submitted which part</span> })
    const info = within(bar()).getByRole('button', { name: 'About this step' })
    expect(info).toHaveAttribute('aria-expanded', 'false')
    expect(within(bar()).queryByText('Who has submitted which part')).not.toBeInTheDocument()
    fireEvent.click(info)
    expect(info).toHaveAttribute('aria-expanded', 'true')
    expect(within(bar()).getByText('Enter the quote per line')).toBeInTheDocument()
    expect(within(bar()).getByText('Who has submitted which part')).toBeInTheDocument()
    fireEvent.click(info)
    expect(within(bar()).queryByText('Who has submitted which part')).not.toBeInTheDocument()
  })

  it('on a phone what blocks the step (status) is always shown, without opening anything', () => {
    setWidth(390)
    show({ status: <span>Enter a price for every line</span>, more: <span>Long explanation</span> })
    expect(within(bar()).getByText('Enter a price for every line')).toBeInTheDocument()
    expect(within(bar()).queryByText('Long explanation')).not.toBeInTheDocument()
  })

  it('on a phone there is no info button when there is nothing to explain', () => {
    setWidth(390)
    show({ hint: undefined })
    expect(within(bar()).queryByRole('button', { name: 'About this step' })).not.toBeInTheDocument()
  })

  it('on a desktop there is no info button: the hint, the explanation and the status are all shown', () => {
    show({ status: <span>Missing a price</span>, more: <span>Who has submitted</span> })
    expect(within(bar()).queryByRole('button', { name: 'About this step' })).not.toBeInTheDocument()
    expect(within(bar()).getByText('Enter the quote per line')).toBeInTheDocument()
    const explanation = within(bar()).getByText('Who has submitted')
    const status = within(bar()).getByText('Missing a price')
    // the explanation comes before the status, as the status block always held them
    expect(
      explanation.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('on a desktop the text block still takes the free width of the row, at least 320px', () => {
    show()
    const textBlock = bar().firstElementChild as HTMLElement
    expect(textBlock.style.flexBasis).toBe('320px')
    expect(textBlock.style.flexGrow).toBe('1')
  })

  it('on a phone it leaves room under the last line so the bar never covers it', () => {
    setWidth(390)
    const { container } = show()
    // the spacer is the last thing the component draws (the info button's icon is aria-hidden too)
    const spacer = container.lastElementChild as HTMLElement
    expect(spacer.getAttribute('aria-hidden')).toBe('true')
    // jsdom has no layout, so the bar is "0px tall" and the spacer falls back to a safe height
    expect(parseInt(spacer.style.height, 10)).toBeGreaterThanOrEqual(120)
  })

  it('on a phone the room left under the last line is the measured height of the bar, plus a little', () => {
    setWidth(390)
    const measured = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(132)
    try {
      const { container } = show()
      const spacer = container.lastElementChild as HTMLElement
      expect(spacer.style.height).toBe('140px')
    } finally {
      measured.mockRestore()
    }
  })

  it('on a desktop it adds no spacer', () => {
    const { container } = show()
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})
