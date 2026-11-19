// The shared Drawer (a panel that slides in from the side; 6 screens use it). It had the same gaps the Modal had: not a
// dialog for a screen reader (no role, no name, a close button that read as "multiplication X" in the muted grey), Esc
// closed it even when a dropdown inside had just used the key, Tab walked out into the page behind, focus did not come
// back to what opened it, a stray click on the dark area threw a half-filled form away, a 460px drawer overflowed a
// 390px phone, and the animation ignored "reduce motion". It now shares one behaviour module with the Modal.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import i18n from '../../../i18n'
import { Drawer } from '../Drawer'
import { Modal } from '../Modal'
import { SearchableSelect } from '../SearchableSelect'

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const css = read('../../../theme/themes.css')

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

const realAnimate = (HTMLElement.prototype as { animate?: unknown }).animate
const realMatchMedia = (window as { matchMedia?: unknown }).matchMedia
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
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
  description?: string
  closeOnBackdrop?: boolean
  withSelect?: boolean
  withModal?: boolean
  noPadding?: boolean
  width?: string
  footer?: boolean
}

function Harness({
  description,
  closeOnBackdrop,
  withSelect,
  withModal,
  noPadding,
  width,
  footer = true,
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
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false)
        }}
        title="Edit stage"
        description={description}
        closeOnBackdrop={closeOnBackdrop}
        noPadding={noPadding}
        width={width}
        footer={
          footer ? (
            <>
              <button
                onClick={() => {
                  setOpen(false)
                }}
              >
                Cancel
              </button>
              <button>Save</button>
            </>
          ) : undefined
        }
      >
        <input aria-label="first" />
        <input aria-label="second" />
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
        {withModal && (
          <button
            onClick={() => {
              setInner(true)
            }}
          >
            open modal
          </button>
        )}
      </Drawer>
      <Modal
        open={inner}
        onClose={() => {
          setInner(false)
        }}
        title="Confirm"
      >
        <span>sure?</span>
      </Modal>
    </ThemeProvider>
  )
}

const opener = () => screen.getByText('opener')
const openIt = () => {
  opener().focus()
  fireEvent.click(opener())
}
const panel = () => screen.getByRole('dialog', { name: 'Edit stage' })
const isOpen = () => screen.queryByRole('dialog', { name: 'Edit stage' }) !== null
const backdrop = () => {
  const el = document.querySelector<HTMLElement>('[data-overlay-backdrop]')
  if (!el) throw new Error('no backdrop')
  return el
}
const escape = (target: Element | Document = document) => {
  fireEvent.keyDown(target, { key: 'Escape' })
}

describe('Drawer as a dialog', () => {
  it('draws nothing while closed', () => {
    render(
      <ThemeProvider>
        <Drawer open={false} onClose={() => undefined} title="x">
          body
        </Drawer>
      </ThemeProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a modal dialog named by its title and described by its description', () => {
    render(<Harness description="Plan the stage" />)
    openIt()
    expect(panel()).toHaveAttribute('aria-modal', 'true')
    expect(panel()).toHaveAccessibleName('Edit stage')
    expect(panel()).toHaveAccessibleDescription('Plan the stage')
  })

  it('has no description attribute when none is given', () => {
    render(<Harness />)
    openIt()
    expect(panel()).not.toHaveAttribute('aria-describedby')
  })

  it('shows the title as a heading', () => {
    render(<Harness />)
    openIt()
    expect(screen.getByRole('heading', { name: 'Edit stage' })).toBeInTheDocument()
  })

  it('has a close button a screen reader calls Close, in the readable grey', () => {
    render(<Harness />)
    openIt()
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toHaveStyle({ color: themes['light-flat'].textSecondary })
    expect(close.querySelector('[aria-hidden="true"]')).not.toBeNull()
    fireEvent.click(close)
    expect(isOpen()).toBe(false)
  })

  it('keeps the title and the close label in Arabic', async () => {
    await i18n.changeLanguage('ar')
    render(<Harness />)
    openIt()
    expect(screen.getByRole('button', { name: i18n.t('ui.generic.close') })).toBeInTheDocument()
  })

  it('puts the buttons it is given under the content, and omits the bar without any', () => {
    const { unmount } = render(<Harness />)
    openIt()
    expect(screen.getByText('Save')).toBeInTheDocument()
    unmount()
    render(<Harness footer={false} />)
    openIt()
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })

  it('takes the width it is given on a desktop and never more than the screen', () => {
    render(<Harness width="460px" />)
    openIt()
    expect(panel()).toHaveStyle({ width: '460px', maxWidth: '100%' })
  })

  it('has no padding to scroll inside when the content brings its own', () => {
    render(<Harness noPadding />)
    openIt()
    const body = screen.getByLabelText('first').parentElement
    expect(body).toHaveStyle({ padding: '0px', overflowY: 'hidden' })
  })
})

describe('Drawer and the keyboard', () => {
  it('closes on Escape', () => {
    render(<Harness />)
    openIt()
    escape()
    expect(isOpen()).toBe(false)
  })

  it('does not close when Escape was used by a dropdown inside', () => {
    render(<Harness withSelect />)
    openIt()
    fireEvent.click(screen.getByText('Pick'))
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    escape(screen.getByPlaceholderText(/search/i))
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument() // the list closed
    expect(isOpen()).toBe(true) // the drawer did not
    escape()
    expect(isOpen()).toBe(false)
  })

  it('leaves a drawer open under a modal that Escape closed', () => {
    render(<Harness withModal />)
    openIt()
    fireEvent.click(screen.getByText('open modal'))
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument()
    escape()
    expect(screen.queryByRole('dialog', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(isOpen()).toBe(true)
    escape()
    expect(isOpen()).toBe(false)
  })

  it('moves focus into the drawer when it opens and back to the opener when it closes', () => {
    render(<Harness />)
    openIt()
    expect(document.activeElement).toBe(panel())
    escape()
    expect(document.activeElement).toBe(opener())
  })

  it('keeps Tab inside: from the last control to the first, and back from the first', () => {
    render(<Harness />)
    openIt()
    const save = screen.getByText('Save')
    save.focus()
    const forward = fireEvent.keyDown(save, { key: 'Tab' })
    expect(forward).toBe(false) // prevented
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    const current = document.activeElement
    if (!current) throw new Error('nothing has focus')
    const back = fireEvent.keyDown(current, { key: 'Tab', shiftKey: true })
    expect(back).toBe(false)
    expect(document.activeElement).toBe(save)
  })

  it('lets Tab move normally between two controls in the middle', () => {
    render(<Harness />)
    openIt()
    const first = screen.getByLabelText('first')
    first.focus()
    expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true)
  })
})

describe('Drawer and the page behind it', () => {
  it('locks the page scroll while open and releases it on close', () => {
    render(<Harness />)
    openIt()
    expect(document.body.style.overflow).toBe('hidden')
    escape()
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps the page locked while a modal opened from the drawer is still open', () => {
    render(<Harness withModal />)
    openIt()
    fireEvent.click(screen.getByText('open modal'))
    escape() // the modal closes
    expect(isOpen()).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    escape()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('Drawer and a click on the dark area', () => {
  it('closes while nothing was typed', () => {
    render(<Harness />)
    openIt()
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(false)
  })

  it('is ignored once something was typed, and Cancel still closes it', () => {
    render(<Harness />)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'x' } })
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
    fireEvent.click(screen.getByText('Cancel'))
    expect(isOpen()).toBe(false)
  })

  it('starts clean each time it opens', () => {
    render(<Harness />)
    openIt()
    fireEvent.input(screen.getByLabelText('first'), { target: { value: 'x' } })
    escape()
    openIt()
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(false)
  })

  it('counts a choice made in a dropdown as something chosen', () => {
    render(<Harness withSelect />)
    openIt()
    fireEvent.click(screen.getByText('Pick'))
    fireEvent.mouseDown(screen.getByText('Beta'))
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
  })

  it('never closes on a click outside when closeOnBackdrop is off', () => {
    render(<Harness closeOnBackdrop={false} />)
    openIt()
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
  })

  it('does not treat a click inside the panel as a click outside', () => {
    render(<Harness />)
    openIt()
    fireEvent.click(panel())
    expect(isOpen()).toBe(true)
  })

  it('bumps the panel sideways to say it was not closed', () => {
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
  })
})

describe('Drawer on a phone', () => {
  beforeEach(() => {
    setWidth(390)
  })

  it('is as wide as the screen, not its own 460px', () => {
    render(<Harness width="460px" />)
    openIt()
    expect(panel()).toHaveStyle({ width: '100%' })
  })

  it('has a close button big enough to hit', () => {
    render(<Harness />)
    openIt()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveStyle({
      width: '44px',
      height: '44px',
    })
  })
})

describe('Drawer direction and motion', () => {
  it('slides in from the right in English and from the left in Arabic', async () => {
    const { unmount } = render(<Harness />)
    openIt()
    expect(document.querySelector('style')?.textContent).toContain('translateX(100%)')
    unmount()
    await i18n.changeLanguage('ar')
    render(<Harness />)
    openIt()
    expect(document.querySelector('style')?.textContent).toContain('translateX(-100%)')
  })

  it('marks the panel and the dark area so the stylesheet can switch the animation off', () => {
    render(<Harness />)
    openIt()
    expect(panel()).toHaveAttribute('data-overlay-panel')
    expect(backdrop()).toBeInTheDocument()
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
    expect(block).toContain('[data-overlay-panel]')
    expect(block).toContain('[data-overlay-backdrop]')
    expect(block).toContain('animation: none !important')
  })
})
