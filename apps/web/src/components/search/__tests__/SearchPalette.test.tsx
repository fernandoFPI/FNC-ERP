// The search palette (Ctrl+K) was a plain div over the page: not a dialog for a screen reader, Tab walked out of it into
// the page behind, focus did not return to what opened it, the page behind kept scrolling, and the app shell closed it
// on any Escape, even one meant for a dialog opened on top of it. It now shares the Modal's behaviour.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { Modal } from '../../ui/Modal'
import { SearchPalette } from '../SearchPalette'

vi.mock('../../../lib/axios', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { groups: [] } }) },
}))

const onClose = vi.fn()

beforeEach(() => {
  document.body.style.overflow = ''
  onClose.mockClear()
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})
afterEach(async () => {
  document.body.style.overflow = ''
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
        <SearchPalette
          open={open}
          prefill=""
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

const NAME = 'Search purchase orders, projects, employees…'
const opener = () => screen.getByText('opener')
const openIt = () => {
  opener().focus()
  fireEvent.click(opener())
}
const escape = (target: Element | Document = document) => {
  fireEvent.keyDown(target, { key: 'Escape' })
}

describe('SearchPalette as a dialog', () => {
  it('draws nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a modal dialog named by its placeholder', () => {
    render(<Harness />)
    openIt()
    const dialog = screen.getByRole('dialog', { name: NAME })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('puts focus in the search box and gives it back to what opened it', async () => {
    render(<Harness />)
    openIt()
    // the panel does not take focus first: the search box is where the person types
    expect(document.activeElement).not.toBe(screen.getByRole('dialog', { name: NAME }))
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('textbox'))
    })
    escape()
    expect(document.activeElement).toBe(opener())
  })

  it('locks the page behind it and releases it on close', () => {
    render(<Harness />)
    openIt()
    expect(document.body.style.overflow).toBe('hidden')
    escape()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('SearchPalette and Escape', () => {
  it('closes on Escape (the app shell no longer does it for the palette)', () => {
    render(<Harness />)
    openIt()
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when something inside already used the key', () => {
    render(<Harness />)
    openIt()
    const box = screen.getByRole('textbox')
    box.addEventListener('keydown', (e) => {
      e.preventDefault()
    })
    box.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves the palette open under a dialog that Escape closed', () => {
    render(<Harness withModal />)
    openIt()
    fireEvent.click(screen.getByText('open modal'))
    escape()
    expect(screen.queryByRole('dialog', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('still closes from a click on the dark area and from the Esc key cap', () => {
    const { unmount } = render(<Harness />)
    openIt()
    const dialog = screen.getByRole('dialog', { name: NAME })
    const backdrop = dialog.parentElement
    if (!backdrop) throw new Error('no backdrop')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    onClose.mockClear()
    render(<Harness />)
    openIt()
    // the palette prints the word in two places; the clickable one is the cap in the search row
    const cap = screen.getAllByText('Esc').find((el) => el.style.cursor === 'pointer')
    if (!cap) throw new Error('no Esc key cap')
    fireEvent.click(cap)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on a click inside the panel', () => {
    render(<Harness />)
    openIt()
    fireEvent.click(screen.getByRole('dialog', { name: NAME }))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('SearchPalette and Tab', () => {
  it('keeps Tab inside the palette (its search box is the only control)', () => {
    render(<Harness />)
    openIt()
    const box = screen.getByRole('textbox')
    box.focus()
    expect(fireEvent.keyDown(box, { key: 'Tab' })).toBe(false)
    expect(fireEvent.keyDown(box, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(document.activeElement).toBe(box)
  })

  it('does not interfere with typing', () => {
    render(<Harness />)
    openIt()
    const box = screen.getByRole('textbox')
    // with focus in the box, the only control: a key other than Tab must not be treated as Tab
    box.focus()
    expect(fireEvent.keyDown(box, { key: 'a' })).toBe(true)
  })
})
