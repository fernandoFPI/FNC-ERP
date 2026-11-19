// The Help drawer rolled its own overlay: it stayed in the page while closed (its buttons were still reachable with Tab
// and a screen reader, off screen), Tab walked out of it into the page behind, focus did not return to the Help button,
// and the app shell closed it on ANY Escape, even one meant for a dialog opened on top of it. It now shares the Modal's
// behaviour (components/ui/overlay.ts).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { Modal } from '../../ui/Modal'
import { HelpDrawer } from '../HelpDrawer'

vi.mock('../tours', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, startTour: vi.fn() }
})

const onClose = vi.fn()

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

beforeEach(() => {
  document.body.style.overflow = ''
  onClose.mockClear()
})
afterEach(async () => {
  document.body.style.overflow = ''
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

function Harness({ withModal }: { withModal?: boolean }) {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(false)
  return (
    <MemoryRouter>
      <ThemeProvider>
        <button
          onClick={() => {
            setOpen(true)
          }}
        >
          opener
        </button>
        {withModal && (
          <button
            onClick={() => {
              setInner(true)
            }}
          >
            open modal
          </button>
        )}
        <HelpDrawer
          open={open}
          onClose={() => {
            onClose()
            setOpen(false)
          }}
        />
        <Modal
          open={inner}
          onClose={() => {
            setInner(false)
          }}
          title="Confirm"
        >
          sure?
        </Modal>
      </ThemeProvider>
    </MemoryRouter>
  )
}

const opener = () => screen.getByText('opener')
const openIt = () => {
  opener().focus()
  fireEvent.click(opener())
}
// The drawer stays mounted, so ask for hidden elements too (a hidden dialog has no accessible name, so no name here).
const panel = () => screen.getByRole('dialog', { hidden: true })
const escape = (target: Element | Document = document) => {
  fireEvent.keyDown(target, { key: 'Escape' })
}

describe('HelpDrawer while closed', () => {
  it('is out of the way: hidden from Tab and from a screen reader, though it stays mounted for the slide', () => {
    render(<Harness />)
    expect(panel()).toHaveAttribute('aria-hidden', 'true')
    expect(panel()).toHaveStyle({ visibility: 'hidden' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close help' })).not.toBeInTheDocument()
  })

  it('does not lock the page and does not react to Escape', () => {
    render(<Harness />)
    expect(document.body.style.overflow).toBe('')
    escape()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('waits for the slide to finish before it hides, so it does not vanish mid-slide', () => {
    render(<Harness />)
    expect(panel().style.transition).toContain('visibility 0s linear 0.28s')
  })
})

describe('HelpDrawer while open', () => {
  it('is a modal dialog, visible and reachable', () => {
    render(<Harness />)
    openIt()
    const dialog = screen.getByRole('dialog', { name: 'Help & Guides' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-hidden', 'false')
    expect(dialog).toHaveStyle({ visibility: 'visible' })
    expect(screen.getByRole('button', { name: 'Close help' })).toBeInTheDocument()
  })

  it('locks the page behind it and releases it on close', () => {
    render(<Harness />)
    openIt()
    expect(document.body.style.overflow).toBe('hidden')
    escape()
    expect(document.body.style.overflow).toBe('')
  })

  it('closes on Escape', () => {
    render(<Harness />)
    openIt()
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when Escape was used by something inside', () => {
    render(<Harness />)
    openIt()
    const box = screen.getByRole('button', { name: 'Close help' })
    box.addEventListener('keydown', (e) => {
      e.preventDefault()
    })
    box.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves the drawer open under a dialog that Escape closed', () => {
    render(<Harness withModal />)
    openIt()
    fireEvent.click(screen.getByText('open modal'))
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument()
    escape()
    expect(screen.queryByRole('dialog', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes from the dark area and from the close button', () => {
    const { unmount } = render(<Harness />)
    openIt()
    const backdrop = document.querySelector<HTMLElement>('[aria-hidden="true"][style*="fixed"]')
    if (!backdrop) throw new Error('no backdrop')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    onClose.mockClear()
    render(<Harness />)
    openIt()
    fireEvent.click(screen.getByRole('button', { name: 'Close help' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('puts focus in the search box, and gives it back to the button that opened it', () => {
    vi.useFakeTimers()
    render(<Harness />)
    openIt()
    // the panel does not take focus first: the search box is where the person types
    expect(document.activeElement).not.toBe(screen.getByRole('dialog', { name: 'Help & Guides' }))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
    escape()
    expect(document.activeElement).toBe(opener())
  })

  it('keeps Tab inside: from the last control to the first and back', () => {
    render(<Harness />)
    openIt()
    const dialog = screen.getByRole('dialog', { name: 'Help & Guides' })
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]'),
    ].filter((el) => el !== dialog && el.getAttribute('tabindex') !== '-1')
    const first = controls[0]
    const last = controls[controls.length - 1]
    last.focus()
    expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(first)
    expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(document.activeElement).toBe(last)
  })

  it('lets Tab move normally from the first control to the next', () => {
    render(<Harness />)
    openIt()
    const close = screen.getByRole('button', { name: 'Close help' })
    close.focus()
    expect(fireEvent.keyDown(close, { key: 'Tab' })).toBe(true)
  })
})

describe('the app shell and the Help drawer', () => {
  // AppShell has no render test (it needs the whole router and stores), so the two rules are pinned in its source.
  const shell = read('../../shell/AppShell.tsx')

  it('no longer closes the Help drawer or the search from its own Escape handler', () => {
    const block =
      /Escape closes[\s\S]*?addEventListener\('keydown', handler\)/.exec(shell)?.[0] ?? ''
    expect(block).toContain("e.key === 'Escape'")
    expect(block).toContain('setPhoneDrawerOpen(false)')
    expect(block).not.toContain('setHelpOpen(false)')
    expect(block).not.toContain('setSearchOpen(false)')
  })

  it('does not open the search from a keystroke while a dialog is open', () => {
    expect(shell).toContain('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"])')
  })
})
