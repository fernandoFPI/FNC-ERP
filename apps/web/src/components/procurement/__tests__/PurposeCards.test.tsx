import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { PurposeCards, type PurposeCardOption } from '../PurposeCards'

type Purpose = 'stock' | 'project' | 'expense'
const OPTIONS: PurposeCardOption<Purpose>[] = [
  { value: 'stock', title: 'General Stock', description: 'Restock the warehouse', icon: <i>s</i> },
  {
    value: 'project',
    title: 'Project Supply',
    description: 'Materials for one project',
    icon: <i>p</i>,
  },
  { value: 'expense', title: 'Expense', description: 'Get back money you paid', icon: <i>e</i> },
]

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
  vi.restoreAllMocks()
})

function mount(value: Purpose = 'stock', onChange: (v: Purpose) => void = () => undefined) {
  return render(
    <ThemeProvider>
      <PurposeCards
        label="Purpose"
        options={OPTIONS}
        value={value}
        onChange={onChange}
        data-tour="req-purpose-row"
      />
    </ThemeProvider>,
  )
}

describe('PurposeCards', () => {
  it('is one radio group, named, with one radio per option in the given order', () => {
    mount()
    expect(screen.getByRole('radiogroup', { name: 'Purpose' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'stock',
      'project',
      'expense',
    ])
  })

  it('names each radio by its title and describes it with its one line', () => {
    mount()
    const radio = screen.getByRole('radio', { name: 'Project Supply' })
    expect(radio).toHaveAccessibleDescription('Materials for one project')
  })

  it('checks only the chosen one', () => {
    mount('project')
    expect(screen.getByRole('radio', { name: 'Project Supply' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'General Stock' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Expense' })).not.toBeChecked()
  })

  it('draws the tick on the chosen card only', () => {
    const { container } = mount('project')
    expect(container.querySelectorAll('[data-tick="on"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-tick="off"]')).toHaveLength(2)
  })

  it('tells the page which one was picked', () => {
    const onChange = vi.fn()
    mount('stock', onChange)
    fireEvent.click(screen.getByRole('radio', { name: 'Expense' }))
    expect(onChange).toHaveBeenCalledWith('expense')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('a click on the card text picks it too (the whole card is the target)', () => {
    const onChange = vi.fn()
    mount('stock', onChange)
    fireEvent.click(screen.getByText('Materials for one project'))
    expect(onChange).toHaveBeenCalledWith('project')
  })

  it('passes data-tour to the group, for the walkthrough', () => {
    const { container } = mount()
    expect(container.querySelector('[data-tour="req-purpose-row"]')).toBe(
      screen.getByRole('radiogroup'),
    )
  })

  it('keeps the radios reachable by keyboard: not display:none, not disabled', () => {
    mount()
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeDisabled()
      expect(radio.style.display).not.toBe('none')
    }
  })

  describe('layout', () => {
    it('is two cards to a row on a phone', () => {
      setWidth(390)
      mount()
      expect(screen.getByRole('radiogroup')).toHaveStyle({
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      })
    })

    it('fits as many cards as there is room for on a desktop, never more than three to a row', () => {
      mount()
      const columns = screen.getByRole('radiogroup').style.gridTemplateColumns
      expect(columns).toContain('auto-fit')
      // the narrowest a column may be is a third of the row, so a fourth never fits
      expect(columns).toContain('/ 3')
    })

    it('draws every description on a desktop, and no caption under the group', () => {
      mount()
      for (const o of OPTIONS) expect(screen.getByText(o.description)).toBeVisible()
      expect(screen.queryByTestId('purpose-caption')).not.toBeInTheDocument()
    })

    it("on a phone draws one caption, the chosen purpose's description, under the group", () => {
      setWidth(390)
      const { rerender } = mount('project')
      expect(screen.getByTestId('purpose-caption')).toHaveTextContent('Materials for one project')
      rerender(
        <ThemeProvider>
          <PurposeCards
            label="Purpose"
            options={OPTIONS}
            value="expense"
            onChange={() => undefined}
          />
        </ThemeProvider>,
      )
      expect(screen.getByTestId('purpose-caption')).toHaveTextContent('Get back money you paid')
    })

    it("on a phone the description is still the radio's description for a screen reader, drawn nowhere inside the card", () => {
      setWidth(390)
      mount()
      const radio = screen.getByRole('radio', { name: 'Project Supply' })
      expect(radio).toHaveAccessibleDescription('Materials for one project')
      const card = radio.closest('label') as HTMLElement
      // the card's own copy is visually hidden (1px, clipped), not display:none
      const own = [...card.querySelectorAll('span')].find(
        (s) => s.textContent === 'Materials for one project',
      )
      expect(own).toBeDefined()
      expect(own?.style.width).toBe('1px')
      expect(own?.style.overflow).toBe('hidden')
    })

    it('the caption is hidden from a screen reader (the radio already says it)', () => {
      setWidth(390)
      mount()
      expect(screen.getByTestId('purpose-caption')).toHaveAttribute('aria-hidden', 'true')
    })

    it('gives the title the whole width of the card on a phone, under the icon and the tick', () => {
      setWidth(390)
      mount()
      const radio = screen.getByRole('radio', { name: 'General Stock' })
      const card = radio.closest('label') as HTMLElement
      const title = [...card.querySelectorAll('span')].find(
        (s) => s.textContent === 'General Stock',
      )
      expect(title?.style.gridColumn).toBe('1 / -1')
      expect(title?.style.gridRow).toBe('2')
    })
  })

  describe('keyboard focus ring', () => {
    const cardOf = (name: string) => {
      const label = screen.getByRole('radio', { name }).closest('label')
      if (!label) throw new Error('no card around the radio')
      return label
    }

    it('shows a ring for keyboard focus', () => {
      mount()
      // answer only :focus-visible; every other selector goes to the real matcher (testing-library needs it)
      // Always called with the element as `this` below, so reading it unbound is safe.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const realMatches = Element.prototype.matches
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
        this: Element,
        sel: string,
      ) {
        if (sel === ':focus-visible') return true
        return realMatches.call(this, sel)
      })
      fireEvent.focus(screen.getByRole('radio', { name: 'Expense' }))
      expect(cardOf('Expense').style.boxShadow).not.toBe('none')
      expect(cardOf('Expense').style.boxShadow).not.toBe('')
    })

    it('shows none after a mouse click (focus that is not :focus-visible)', () => {
      mount()
      // Always called with the element as `this` below, so reading it unbound is safe.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const realMatches = Element.prototype.matches
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
        this: Element,
        sel: string,
      ) {
        if (sel === ':focus-visible') return false
        return realMatches.call(this, sel)
      })
      fireEvent.focus(screen.getByRole('radio', { name: 'Expense' }))
      expect(cardOf('Expense').style.boxShadow).toBe('none')
    })

    it('takes the ring away when focus leaves', () => {
      mount()
      const radio = screen.getByRole('radio', { name: 'Expense' })
      fireEvent.focus(radio)
      fireEvent.blur(radio)
      expect(cardOf('Expense').style.boxShadow).toBe('none')
    })
  })
})
