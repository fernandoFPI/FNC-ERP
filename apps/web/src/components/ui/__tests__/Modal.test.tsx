// The shared Modal (49 files use it, 48 of them put inputs in it). What it used to get wrong, found by probing it:
// it was not a dialog for a screen reader (no role, a close button named "multiplication X"), Esc inside an open
// dropdown closed the whole modal and with it everything typed, one Esc closed every stacked modal, a stray click on the
// dark area threw a half-filled form away, focus did not come back to what opened it, Tab walked out into the page
// behind, the phone sheet's grab handle did nothing, and the animations ignored "reduce motion".
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import i18n from '../../../i18n'
import { Modal } from '../Modal'
import { SearchableSelect } from '../SearchableSelect'

// Read with fs, the path through a variable (see theme/__tests__/phoneGrid.test.tsx for why).
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const css = read('../../../theme/themes.css')

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

beforeAll(() => {
  // jsdom has no layout: the dropdown scrolls its highlighted row into view
  Element.prototype.scrollIntoView = vi.fn()
  // ...and no pointer capture, which the phone sheet's handle takes on a swipe (without it every swipe test logged an
  // uncaught TypeError and the whole run exited with code 1 although all tests passed)
  Element.prototype.setPointerCapture = vi.fn()
})
// Two tests below replace these on the page. A stub that is still there for the NEXT test (a `vi.fn()` that
// `restoreAllMocks` has already emptied) made the phone sheet's "ignored click" bump throw an uncaught TypeError.
const realAnimate = (HTMLElement.prototype as { animate?: unknown }).animate
const realMatchMedia = (window as { matchMedia?: unknown }).matchMedia
beforeEach(() => {
  document.body.style.overflow = ''
})
afterEach(async () => {
  setWidth(1024)
  document.body.style.overflow = ''
  ;(HTMLElement.prototype as { animate?: unknown }).animate = realAnimate
  ;(window as { matchMedia?: unknown }).matchMedia = realMatchMedia
  await i18n.changeLanguage('en')
  vi.restoreAllMocks()
})

interface HarnessProps {
  title?: string
  description?: string
  closeOnBackdrop?: boolean
  withSelect?: boolean
  withNested?: boolean
  // controls after the last real one: a folded-away button and a disabled one (neither can take focus)
  trailing?: boolean
}

function Harness({
  title = 'Edit thing',
  description,
  closeOnBackdrop,
  withSelect,
  withNested,
  trailing,
}: HarnessProps) {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(false)
  const [picked, setPicked] = useState('')
  return (
    <ThemeProvider>
      <button
        onClick={() => {
          setOpen(true)
        }}
      >
        opener
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
        }}
        title={title || undefined}
        description={description}
        closeOnBackdrop={closeOnBackdrop}
        footer={
          <>
            <button
              onClick={() => {
                setOpen(false)
              }}
            >
              Cancel
            </button>
            <button>Save</button>
            {trailing && (
              <>
                <span style={{ display: 'none' }}>
                  <button>folded away</button>
                </span>
                <button disabled>switched off</button>
              </>
            )}
          </>
        }
      >
        <input aria-label="first" />
        <input aria-label="second" />
        <input type="checkbox" aria-label="tick" />
        {withSelect && (
          <SearchableSelect
            value={picked}
            onChange={setPicked}
            options={[
              { value: 'a', label: 'Alpha' },
              { value: 'b', label: 'Beta' },
            ]}
            placeholder="Pick"
          />
        )}
        {withNested && (
          <button
            onClick={() => {
              setInner(true)
            }}
          >
            open inner
          </button>
        )}
      </Modal>
      <Modal
        open={inner}
        onClose={() => {
          setInner(false)
        }}
        title="Inner"
      >
        <span>inner body</span>
      </Modal>
    </ThemeProvider>
  )
}

const opener = () => screen.getByText('opener')
const openIt = () => {
  opener().focus()
  fireEvent.click(opener())
}
const panel = () => screen.getByRole('dialog', { name: 'Edit thing' })
const isOpen = () => screen.queryByRole('dialog', { name: 'Edit thing' }) !== null
const backdrop = () => {
  const el = document.querySelector<HTMLElement>('[data-modal-backdrop]')
  if (!el) throw new Error('no backdrop')
  return el
}
const escape = (target: Element | Document = document) => {
  fireEvent.keyDown(target, { key: 'Escape' })
}

describe('Modal as a dialog', () => {
  it('draws nothing while closed', () => {
    render(
      <ThemeProvider>
        <Modal open={false} onClose={() => undefined} title="x">
          body
        </Modal>
      </ThemeProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a modal dialog named by its title and described by its description', () => {
    render(<Harness description="Say why" />)
    openIt()
    const dialog = panel()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Edit thing')
    expect(dialog).toHaveAccessibleDescription('Say why')
  })

  it('is still a dialog with no title, just without a name', () => {
    render(<Harness title="" />)
    openIt()
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toHaveAttribute('aria-labelledby')
    expect(dialog).not.toHaveAttribute('aria-describedby')
  })

  it('names the close button, and hides its drawn cross from a screen reader', () => {
    render(<Harness />)
    openIt()
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toHaveAttribute('type', 'button')
    expect(close.querySelector('[aria-hidden="true"]')).toHaveTextContent('✕')
  })

  it('names the close button in Arabic', async () => {
    await i18n.changeLanguage('ar')
    render(<Harness />)
    openIt()
    expect(screen.getByRole('button', { name: 'إغلاق' })).toBeInTheDocument()
  })

  it('draws the cross in the readable grey, not the pale one', () => {
    render(<Harness />)
    openIt()
    const close = screen.getByRole('button', { name: 'Close' })
    const light = themes['light-flat']
    expect(close.style.color).not.toBe('')
    // rgb() vs hex: compare through a throwaway element
    const probe = document.createElement('div')
    probe.style.color = light.textMuted
    expect(close.style.color).not.toBe(probe.style.color)
  })

  it('closes from the close button', () => {
    render(<Harness />)
    openIt()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(isOpen()).toBe(false)
  })
})

describe('Modal and Escape', () => {
  it('closes on Escape', () => {
    render(<Harness />)
    openIt()
    escape()
    expect(isOpen()).toBe(false)
  })

  it('does not close while a dropdown inside it is open: the key closes the list only', () => {
    render(<Harness withSelect />)
    openIt()
    fireEvent.click(screen.getByText('Pick'))
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    escape(screen.getByPlaceholderText(/search/i))
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(isOpen()).toBe(true)
    // with the list shut, the next Escape closes the modal
    escape()
    expect(isOpen()).toBe(false)
  })

  it('closes only the top modal when two are stacked', () => {
    render(<Harness withNested />)
    openIt()
    fireEvent.click(screen.getByText('open inner'))
    expect(screen.getByText('inner body')).toBeInTheDocument()
    escape()
    expect(screen.queryByText('inner body')).not.toBeInTheDocument()
    expect(isOpen()).toBe(true)
    escape()
    expect(isOpen()).toBe(false)
  })

  it('leaves a key that something inside already used alone', () => {
    render(<Harness />)
    openIt()
    const input = screen.getByLabelText('first')
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.preventDefault()
    })
    escape(input)
    expect(isOpen()).toBe(true)
  })
})

describe('Modal and focus', () => {
  it('moves focus into the modal when it opens', () => {
    render(<Harness />)
    openIt()
    expect(panel()).toHaveFocus()
  })

  it('gives focus back to what opened it', () => {
    render(<Harness />)
    openIt()
    escape()
    expect(opener()).toHaveFocus()
  })

  it('gives focus back after the close button and after Cancel too', () => {
    render(<Harness />)
    openIt()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(opener()).toHaveFocus()
    openIt()
    fireEvent.click(screen.getByText('Cancel'))
    expect(opener()).toHaveFocus()
  })

  it('does not fail when what opened it is gone', () => {
    function Gone() {
      const [show, setShow] = useState(true)
      const [open, setOpen] = useState(false)
      return (
        <ThemeProvider>
          {show && (
            <button
              onClick={() => {
                setOpen(true)
                setShow(false)
              }}
            >
              vanishing opener
            </button>
          )}
          <Modal
            open={open}
            onClose={() => {
              setOpen(false)
            }}
            title="T"
          >
            body
          </Modal>
        </ThemeProvider>
      )
    }
    render(<Gone />)
    const trigger = screen.getByText('vanishing opener')
    trigger.focus()
    fireEvent.click(trigger)
    expect(() => {
      escape()
    }).not.toThrow()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Modal keeps Tab inside', () => {
  const tab = (shift = false) => {
    const active = document.activeElement ?? document.body
    const notPrevented = fireEvent.keyDown(active, { key: 'Tab', shiftKey: shift })
    return !notPrevented // true when the modal took the key
  }
  const close = () => screen.getByRole('button', { name: 'Close' })

  it('goes from the last control back to the first', () => {
    render(<Harness />)
    openIt()
    screen.getByText('Save').focus()
    expect(tab()).toBe(true)
    expect(close()).toHaveFocus()
  })

  it('goes from the first control back to the last, with Shift', () => {
    render(<Harness />)
    openIt()
    close().focus()
    expect(tab(true)).toBe(true)
    expect(screen.getByText('Save')).toHaveFocus()
  })

  it('goes to the last control from the panel itself with Shift', () => {
    render(<Harness />)
    openIt()
    expect(panel()).toHaveFocus()
    expect(tab(true)).toBe(true)
    expect(screen.getByText('Save')).toHaveFocus()
  })

  it('leaves Tab alone in the middle, so the browser moves on as usual', () => {
    render(<Harness />)
    openIt()
    screen.getByLabelText('first').focus()
    expect(tab()).toBe(false)
  })

  it('skips a disabled control and a folded-away one at the end', () => {
    render(<Harness trailing />)
    openIt()
    // after Save come a button that is display:none and one that is disabled: Save is still the last one
    screen.getByText('Save').focus()
    expect(tab()).toBe(true)
    expect(close()).toHaveFocus()
  })

  it('skips them at the start too, going backward', () => {
    render(<Harness trailing />)
    openIt()
    close().focus()
    expect(tab(true)).toBe(true)
    expect(screen.getByText('Save')).toHaveFocus()
  })

  it('does not trap Tab inside a dropdown list drawn outside the modal', () => {
    render(<Harness withSelect />)
    openIt()
    fireEvent.click(screen.getByText('Pick'))
    const search = screen.getByPlaceholderText(/search/i)
    search.focus()
    expect(tab()).toBe(false)
  })
})

describe('Modal and a click on the dark area (desktop)', () => {
  it('closes a modal nothing was typed in', () => {
    render(<Harness />)
    openIt()
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(false)
  })

  it('does not close when the click is inside the panel', () => {
    render(<Harness />)
    openIt()
    fireEvent.click(panel())
    expect(isOpen()).toBe(true)
  })

  it('ignores the click once something was typed', () => {
    render(<Harness />)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'half a form' } })
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
    expect(panel()).toHaveFocus()
  })

  it('ignores the click once a box was ticked', () => {
    render(<Harness />)
    openIt()
    fireEvent.click(screen.getByLabelText('tick'))
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
  })

  it('ignores the click once an option was chosen in a dropdown', () => {
    render(<Harness withSelect />)
    openIt()
    fireEvent.click(screen.getByText('Pick'))
    fireEvent.mouseDown(screen.getByText('Beta'))
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
  })

  it('ignores the click once an option was chosen from the keyboard', () => {
    render(<Harness withSelect />)
    openIt()
    fireEvent.click(screen.getByText('Pick'))
    const search = screen.getByPlaceholderText(/search/i)
    fireEvent.keyDown(search, { key: 'Enter' })
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
  })

  it('still closes from Esc, the close button and Cancel after typing', () => {
    render(<Harness />)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'x' } })
    escape()
    expect(isOpen()).toBe(false)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(isOpen()).toBe(false)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'x' } })
    fireEvent.click(screen.getByText('Cancel'))
    expect(isOpen()).toBe(false)
  })

  it('starts clean again each time it opens', () => {
    render(<Harness />)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'x' } })
    escape()
    openIt()
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(false)
  })

  it('never closes on a click outside when closeOnBackdrop is off', () => {
    render(<Harness closeOnBackdrop={false} />)
    openIt()
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
  })

  it('bumps the panel to say it was not closed', () => {
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    render(<Harness />)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'x' } })
    fireEvent.click(backdrop())
    expect(animate).toHaveBeenCalledTimes(1)
  })

  it('does not bump for someone who asked for less motion', () => {
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    render(<Harness />)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'x' } })
    fireEvent.click(backdrop())
    expect(animate).not.toHaveBeenCalled()
    expect(isOpen()).toBe(true)
  })
})

describe('Modal and the page behind it', () => {
  it('locks the page while open and frees it after', () => {
    render(<Harness />)
    openIt()
    expect(document.body.style.overflow).toBe('hidden')
    escape()
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps the page locked while a second modal is still open', () => {
    render(<Harness withNested />)
    openIt()
    fireEvent.click(screen.getByText('open inner'))
    escape() // the inner one closes
    expect(isOpen()).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    escape()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('Modal on a phone (a bottom sheet)', () => {
  beforeEach(() => {
    setWidth(390)
  })
  const handle = () => screen.getByTestId('sheet-handle')
  // React listens for the native pointer events; a MouseEvent of that type carries clientY in jsdom
  const pointer = (type: string, y: number) => {
    fireEvent(handle(), new MouseEvent(type, { bubbles: true, clientY: y }))
  }

  it('is a dialog too, with the same name and close button', () => {
    render(<Harness />)
    openIt()
    expect(panel()).toHaveAttribute('aria-modal', 'true')
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
  })

  it('has a grab handle that a screen reader does not announce', () => {
    render(<Harness />)
    openIt()
    expect(handle()).toHaveAttribute('aria-hidden', 'true')
    expect(handle().style.touchAction).toBe('none')
  })

  it('closes when the handle is pulled down far enough', () => {
    render(<Harness />)
    openIt()
    pointer('pointerdown', 100)
    pointer('pointermove', 150)
    expect(panel().style.transform).toBe('translateY(50px)')
    pointer('pointermove', 220)
    pointer('pointerup', 220)
    expect(isOpen()).toBe(false)
  })

  it('springs back, and stays open, when it is not pulled far enough', () => {
    render(<Harness />)
    openIt()
    pointer('pointerdown', 100)
    pointer('pointermove', 140)
    pointer('pointerup', 140)
    expect(isOpen()).toBe(true)
    expect(panel().style.transform).toBe('')
  })

  it('does not follow a pull upward', () => {
    render(<Harness />)
    openIt()
    pointer('pointerdown', 300)
    pointer('pointermove', 100)
    expect(panel().style.transform).toBe('translateY(0px)')
    pointer('pointerup', 100)
    expect(isOpen()).toBe(true)
  })

  it('springs back when the touch is cancelled, however far it went', () => {
    render(<Harness />)
    openIt()
    pointer('pointerdown', 100)
    pointer('pointermove', 400)
    pointer('pointercancel', 400)
    expect(isOpen()).toBe(true)
    expect(panel().style.transform).toBe('')
  })

  it('ignores a move that did not start on the handle', () => {
    render(<Harness />)
    openIt()
    pointer('pointermove', 400)
    pointer('pointerup', 400)
    expect(isOpen()).toBe(true)
  })

  it('closes on a click on the dark area, unless something was typed', () => {
    render(<Harness />)
    openIt()
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(false)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'x' } })
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
  })

  it('keeps Tab inside the sheet too', () => {
    render(<Harness />)
    openIt()
    screen.getByText('Save').focus()
    const notPrevented = fireEvent.keyDown(screen.getByText('Save'), { key: 'Tab' })
    expect(notPrevented).toBe(false)
  })
})

describe('Modal and reduced motion', () => {
  it('marks the panel and the dark area so the stylesheet can switch the animation off', () => {
    render(<Harness />)
    openIt()
    expect(panel()).toHaveAttribute('data-modal-panel')
    expect(backdrop()).toBeInTheDocument()
  })

  it('marks them on the phone sheet too', () => {
    setWidth(390)
    render(<Harness />)
    openIt()
    expect(panel()).toHaveAttribute('data-modal-panel')
    expect(backdrop()).toBeInTheDocument()
  })

  it('has a stylesheet rule that stops the animation, strong enough to beat the inline one', () => {
    expect(css.length).toBeGreaterThan(1000)
    const rule = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)
    expect(rule).not.toBeNull()
    expect(rule?.[1]).toMatch(/\[data-modal-panel\]/)
    expect(rule?.[1]).toMatch(/\[data-modal-backdrop\]/)
    expect(rule?.[1]).toMatch(/animation:\s*none\s*!important/)
  })
})
