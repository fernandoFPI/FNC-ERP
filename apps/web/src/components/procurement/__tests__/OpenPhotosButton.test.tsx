// The button that opens the receipts-and-photos window: a window on a desktop, a tab on a phone, and a message when the browser
// blocks it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { OpenPhotosButton } from '../OpenPhotosButton'

const addToast = vi.fn()
vi.mock('../../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}))

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
const renderRequisitionButton = (id = 'req-btn-1') =>
  render(
    <ThemeProvider>
      <OpenPhotosButton requisitionId={id} />
    </ThemeProvider>,
  )
const renderButton = (id = 'po-btn-1') =>
  render(
    <ThemeProvider>
      <OpenPhotosButton poId={id} />
    </ThemeProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(() => {
  setWidth(1024)
  vi.restoreAllMocks()
})

describe('OpenPhotosButton', () => {
  it('says what it does, with a hint about the second screen', () => {
    renderButton()
    expect(screen.getByRole('button', { name: 'Receipts & photos ↗' })).toBeInTheDocument()
    expect(screen.getByTitle(/second screen/i)).toBeInTheDocument()
  })

  it('opens the PO viewer as a window of its own', () => {
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValue({ closed: false, focus: vi.fn() } as unknown as Window)
    renderButton('po-btn-2')
    fireEvent.click(screen.getByRole('button'))
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toBe('/viewer/purchase-orders/po-btn-2/photos')
    expect(open.mock.calls[0][2]).toContain('popup=yes')
    expect(addToast).not.toHaveBeenCalled()
  })

  it('opens the requisition viewer when given a requisition (review stage: no purchase order yet)', () => {
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValue({ closed: false, focus: vi.fn() } as unknown as Window)
    renderRequisitionButton('req-btn-2')
    fireEvent.click(screen.getByRole('button', { name: 'Receipts & photos ↗' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toBe('/viewer/requisitions/req-btn-2/photos')
    expect(open.mock.calls[0][1]).toBe('fnc-req-photos-req-btn-2')
  })

  it('on a phone opens a tab, because a phone has no windows to move', () => {
    setWidth(390)
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValue({ closed: false, focus: vi.fn() } as unknown as Window)
    renderButton('po-btn-3')
    fireEvent.click(screen.getByRole('button'))
    expect(open.mock.calls[0]).toHaveLength(2)
  })

  describe('as a floating window (no address bar)', () => {
    const popup = () =>
      vi
        .spyOn(window, 'open')
        .mockReturnValue({ closed: false, focus: vi.fn() } as unknown as Window)

    it('opens the floating window when the browser has one, and no pop-up', async () => {
      const open = popup()
      const floating = vi.fn().mockResolvedValue(true)
      render(
        <ThemeProvider>
          <OpenPhotosButton poId="po-btn-5" onOpenFloating={floating} />
        </ThemeProvider>,
      )
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        expect(floating).toHaveBeenCalledTimes(1)
      })
      expect(open).not.toHaveBeenCalled()
    })

    it('falls back to a pop-up window when the browser cannot float one', async () => {
      const open = popup()
      const floating = vi.fn().mockResolvedValue(false)
      render(
        <ThemeProvider>
          <OpenPhotosButton poId="po-btn-6" onOpenFloating={floating} />
        </ThemeProvider>,
      )
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        expect(open).toHaveBeenCalledTimes(1)
      })
      expect(open.mock.calls[0][0]).toBe('/viewer/purchase-orders/po-btn-6/photos')
    })

    it('falls back to a pop-up window when opening the floating one throws', async () => {
      const open = popup()
      const floating = vi.fn().mockRejectedValue(new Error('no'))
      render(
        <ThemeProvider>
          <OpenPhotosButton poId="po-btn-7" onOpenFloating={floating} />
        </ThemeProvider>,
      )
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        expect(open).toHaveBeenCalledTimes(1)
      })
    })

    it('still tells the person when the fallback pop-up is blocked too', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null)
      const floating = vi.fn().mockResolvedValue(false)
      render(
        <ThemeProvider>
          <OpenPhotosButton poId="po-btn-8" onOpenFloating={floating} />
        </ThemeProvider>,
      )
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
      })
    })

    it('does not float anything on a phone: it opens a tab', () => {
      setWidth(390)
      const open = popup()
      const floating = vi.fn().mockResolvedValue(true)
      render(
        <ThemeProvider>
          <OpenPhotosButton poId="po-btn-9" onOpenFloating={floating} />
        </ThemeProvider>,
      )
      fireEvent.click(screen.getByRole('button'))
      expect(floating).not.toHaveBeenCalled()
      expect(open.mock.calls[0]).toHaveLength(2)
    })
  })

  it('tells the person when the browser blocked the window', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    renderButton('po-btn-4')
    fireEvent.click(screen.getByRole('button'))
    expect(addToast).toHaveBeenCalledWith({
      type: 'error',
      message: 'The browser blocked the new window. Allow pop-ups for this site, then try again.',
    })
  })
})
