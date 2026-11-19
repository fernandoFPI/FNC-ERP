// The receipts-and-photos window of a purchase order: every picture of the order grouped, a big picture with zoom / rotate / drag
// and the arrow keys, and a window that remembers where it was put and asks for fresh links when it comes back to the front.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, fireEvent, within, waitFor, act, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { ENTITY_ATTACHMENTS_QUERY } from '../../../graphql/hr'
import { PO_PHOTOS_QUERY } from '../../../graphql/procurement'

const mockUseQuery = vi.fn()
const mockClientQuery = vi.fn()
const stableClient = { query: (...args: unknown[]): unknown => mockClientQuery(...args) }
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    // one client object for every render, like the real one (a new object each time re-runs the page's effect for ever)
    useApolloClient: () => stableClient,
    gql: actual.gql,
  }
})

const refetchPhotos = vi.fn()
const refetchAttachments = vi.fn()

interface Receipt {
  id: string
  status: string
  receipt_date: string | null
  photos: {
    id: string
    fileId: string
    label: string | null
    category: string
    originalFilename: string
    downloadUrl: string | null
    createdAt: string
  }[]
}
const photo = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  fileId: `f-${id}`,
  label: null,
  category: 'po_receipt_photo',
  originalFilename: `${id}.jpg`,
  downloadUrl: `https://files.test/${id}.jpg`,
  createdAt: '2026-11-17T10:00:00Z',
  ...over,
})
const receipt = (
  id: string,
  photos: ReturnType<typeof photo>[],
  status = 'confirmed',
): Receipt => ({
  id,
  status,
  receipt_date: '2026-11-17',
  photos,
})
const attachment = (id: string, source: string | null, over: Record<string, unknown> = {}) => ({
  id,
  file: { id: `file-${id}`, originalFilename: `${id}.jpg`, mimeType: 'image/jpeg' },
  label: null,
  createdAt: '2026-11-16T09:00:00Z',
  sourceEntityType: source,
  ...over,
})

const state = {
  po: {
    data: undefined as unknown,
    loading: false,
    error: undefined as unknown,
    refetch: refetchPhotos,
  },
  attachments: {
    data: { entityAttachments: [] as unknown[] },
    loading: false,
    error: undefined,
    refetch: refetchAttachments,
  },
}
function setData(receipts: Receipt[], attachments: unknown[] = []) {
  state.po = {
    data: { purchaseOrder: { id: 'po-1', po_number: 'PO-2026-0056', receipts } },
    loading: false,
    error: undefined,
    refetch: refetchPhotos,
  }
  state.attachments = {
    data: { entityAttachments: attachments },
    loading: false,
    error: undefined,
    refetch: refetchAttachments,
  }
}

let PoPhotoViewerPage: ComponentType
beforeAll(async () => {
  PoPhotoViewerPage = (await import('../purchase-orders/PoPhotoViewerPage')).default
}, 120_000)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.title = ''
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === PO_PHOTOS_QUERY) return state.po
    if (doc === ENTITY_ATTACHMENTS_QUERY) return state.attachments
    return { data: undefined, loading: false }
  })
  // a signed link per file, named after it
  mockClientQuery.mockImplementation((opts: { variables: { fileId: string } }) =>
    Promise.resolve({
      data: { fileDownloadUrl: { downloadUrl: `https://files.test/${opts.variables.fileId}` } },
    }),
  )
  // jsdom has no pointer capture
  Element.prototype.setPointerCapture = vi.fn()
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

async function openViewer() {
  const view = render(
    <MemoryRouter initialEntries={['/viewer/purchase-orders/po-1/photos']}>
      <ThemeProvider>
        <Routes>
          <Route path="/viewer/purchase-orders/:id/photos" element={<PoPhotoViewerPage />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return view
}
const counter = () => screen.queryByText(/^\d+ of \d+$/)
const thumbs = () => within(screen.getByRole('navigation')).getAllByRole('button')
const bigImage = () => screen.getByTestId('photo-canvas').querySelector('img')
const press = (key: string) => {
  fireEvent.keyDown(window, { key })
}

describe('the pictures, grouped', () => {
  it('has a group for the buyers receipts, the vendor receipt, the materials and the delivery photos, in that order', async () => {
    setData(
      [receipt('r1', [photo('mat-1'), photo('ven-1', { category: 'po_receipt_document' })])],
      [attachment('a-buyer', 'po_line_purchase'), attachment('a-del', 'purchase_order')],
    )
    await openViewer()
    await waitFor(() => {
      expect(thumbs()).toHaveLength(4)
    })
    const headings = within(screen.getByRole('navigation'))
      .getAllByText(/\(\d+\)$/)
      .map((h) => h.textContent)
    expect(headings).toEqual([
      'Buyer Receipts (1)',
      'Vendor Receipt (1)',
      'Materials Received (1)',
      'Delivery Photos (1)',
    ])
  })

  it('counts the pictures in each group', async () => {
    setData(
      [receipt('r1', [photo('m1'), photo('m2'), photo('m3')])],
      [attachment('b1', 'po_line_purchase'), attachment('b2', 'po_line_purchase')],
    )
    await openViewer()
    await waitFor(() => {
      expect(thumbs()).toHaveLength(5)
    })
    expect(screen.getByText('Buyer Receipts (2)')).toBeInTheDocument()
    expect(screen.getByText('Materials Received (3)')).toBeInTheDocument()
  })

  it('puts a file attached some other way under Other files', async () => {
    setData([], [attachment('x1', 'something_else')])
    await openViewer()
    await waitFor(() => {
      expect(screen.getByText('Other files (1)')).toBeInTheDocument()
    })
  })

  it('leaves out the pictures of a cancelled receipt (they prove nothing)', async () => {
    setData([
      receipt('r1', [photo('good')]),
      receipt('r2', [photo('gone-1'), photo('gone-2')], 'cancelled'),
    ])
    await openViewer()
    expect(thumbs()).toHaveLength(1)
  })

  it('shows what is picked at the top: the group, the name and the date', async () => {
    setData([
      receipt('r1', [
        photo('m1', { label: 'Pipes on the pallet', createdAt: '2026-11-12T10:00:00Z' }),
      ]),
    ])
    await openViewer()
    expect(
      screen.getByText(/Materials Received · Pipes on the pallet · 2026-11-12/),
    ).toBeInTheDocument()
  })

  it('names the window after the PO', async () => {
    setData([receipt('r1', [photo('m1')])])
    await openViewer()
    expect(screen.getByText('PO-2026-0056 · Receipts & photos')).toBeInTheDocument()
    expect(document.title).toBe('PO-2026-0056 · Receipts & photos')
  })
})

describe('choosing a picture', () => {
  beforeEach(() => {
    setData([receipt('r1', [photo('p1'), photo('p2'), photo('p3')])])
  })

  it('starts on the first one', async () => {
    await openViewer()
    expect(counter()).toHaveTextContent('1 of 3')
    expect(bigImage()).toHaveAttribute('src', 'https://files.test/p1.jpg')
    expect(thumbs()[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('a thumbnail shows that picture', async () => {
    await openViewer()
    fireEvent.click(thumbs()[2])
    expect(counter()).toHaveTextContent('3 of 3')
    expect(bigImage()).toHaveAttribute('src', 'https://files.test/p3.jpg')
    expect(thumbs()[2]).toHaveAttribute('aria-pressed', 'true')
    expect(thumbs()[0]).toHaveAttribute('aria-pressed', 'false')
  })

  it('the arrow keys go to the next and the previous, round the ends', async () => {
    await openViewer()
    press('ArrowRight')
    expect(counter()).toHaveTextContent('2 of 3')
    press('ArrowRight')
    press('ArrowRight')
    expect(counter()).toHaveTextContent('1 of 3')
    press('ArrowLeft')
    expect(counter()).toHaveTextContent('3 of 3')
  })

  it('the Next and Previous buttons do the same', async () => {
    await openViewer()
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }))
    expect(counter()).toHaveTextContent('2 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Previous picture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous picture' }))
    expect(counter()).toHaveTextContent('3 of 3')
  })

  it('in Arabic the arrows swap: the right arrow goes back', async () => {
    await i18n.changeLanguage('ar')
    await openViewer()
    press('ArrowLeft')
    expect(screen.getByText(/^2 من 3$/)).toBeInTheDocument()
    press('ArrowRight')
    expect(screen.getByText(/^1 من 3$/)).toBeInTheDocument()
  })

  it('draws the same two arrows on the Previous and Next buttons in Arabic: ‹ and › are mirrored by the browser there, swapping them would flip them back', async () => {
    await openViewer()
    expect(screen.getByRole('button', { name: 'Previous picture' })).toHaveTextContent('‹')
    expect(screen.getByRole('button', { name: 'Next picture' })).toHaveTextContent('›')
    cleanup()
    await i18n.changeLanguage('ar')
    await openViewer()
    expect(
      screen.getByRole('button', { name: i18n.t('po.photoViewer.previous') }),
    ).toHaveTextContent('‹')
    expect(screen.getByRole('button', { name: i18n.t('po.photoViewer.next') })).toHaveTextContent(
      '›',
    )
  })

  it('ignores a key with Ctrl held (it belongs to the browser)', async () => {
    await openViewer()
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true })
    expect(counter()).toHaveTextContent('1 of 3')
  })
})

describe('looking at a picture', () => {
  beforeEach(() => {
    setData([receipt('r1', [photo('p1'), photo('p2')])])
  })
  const transform = () => bigImage()?.style.transform ?? ''
  const zoomLabel = () => screen.getByText(/^\d+%$/)

  it('starts fitted, at 100 %, not turned', async () => {
    await openViewer()
    expect(zoomLabel()).toHaveTextContent('100%')
    expect(transform()).toContain('scale(1)')
    expect(transform()).toContain('rotate(0deg)')
  })

  it('zooms in and out with the buttons and the + and - keys, and shows how far', async () => {
    await openViewer()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(zoomLabel()).toHaveTextContent('125%')
    press('+')
    expect(zoomLabel()).toHaveTextContent('156%')
    press('-')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(zoomLabel()).toHaveTextContent('100%')
  })

  it('zooms with the mouse wheel', async () => {
    await openViewer()
    const canvas = screen.getByTestId('photo-canvas')
    fireEvent.wheel(canvas, { deltaY: -100 })
    expect(zoomLabel()).toHaveTextContent('125%')
    fireEvent.wheel(canvas, { deltaY: 100 })
    expect(zoomLabel()).toHaveTextContent('100%')
  })

  it('stops zooming at the limits', async () => {
    await openViewer()
    for (let i = 0; i < 40; i++) press('+')
    expect(zoomLabel()).toHaveTextContent('800%')
    for (let i = 0; i < 60; i++) press('-')
    expect(zoomLabel()).toHaveTextContent('25%')
  })

  it('turns a quarter at a time, with the button and the R key, round to the start', async () => {
    await openViewer()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    expect(transform()).toContain('rotate(90deg)')
    press('r')
    expect(transform()).toContain('rotate(180deg)')
    press('R')
    press('r')
    expect(transform()).toContain('rotate(0deg)')
  })

  it('fits again: back to 100 %, not turned, not moved', async () => {
    await openViewer()
    press('+')
    press('r')
    fireEvent.click(screen.getByRole('button', { name: 'Fit to window' }))
    expect(zoomLabel()).toHaveTextContent('100%')
    expect(transform()).toContain('rotate(0deg)')
    press('+')
    press('0')
    expect(zoomLabel()).toHaveTextContent('100%')
  })

  it('a double click zooms in, and another puts it back', async () => {
    await openViewer()
    const canvas = screen.getByTestId('photo-canvas')
    fireEvent.doubleClick(canvas)
    expect(zoomLabel()).toHaveTextContent('200%')
    fireEvent.doubleClick(canvas)
    expect(zoomLabel()).toHaveTextContent('100%')
  })

  it('drags the picture when it is zoomed', async () => {
    await openViewer()
    const canvas = screen.getByTestId('photo-canvas')
    // jsdom has no PointerEvent: play them as mouse events of the pointer type
    const pointer = (type: string, x: number, y: number) =>
      fireEvent(canvas, new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }))
    pointer('pointerdown', 100, 100)
    pointer('pointermove', 130, 90)
    expect(transform()).toContain('translate(30px, -10px)')
    pointer('pointerup', 130, 90)
    pointer('pointermove', 300, 300)
    expect(transform()).toContain('translate(30px, -10px)')
  })

  it('choosing another picture starts it fitted again', async () => {
    await openViewer()
    press('+')
    press('r')
    press('ArrowRight')
    expect(zoomLabel()).toHaveTextContent('100%')
    expect(transform()).toContain('rotate(0deg)')
  })

  it('offers the file itself to open', async () => {
    await openViewer()
    expect(screen.getByRole('link', { name: 'Open the file' })).toHaveAttribute(
      'href',
      'https://files.test/p1.jpg',
    )
  })
})

describe('files that are not pictures', () => {
  it('shows a PDF in a frame', async () => {
    setData([
      receipt('r1', [
        photo('doc', {
          originalFilename: 'receipt.pdf',
          downloadUrl: 'https://files.test/receipt.pdf',
        }),
      ]),
    ])
    await openViewer()
    const frame = screen.getByTestId('photo-canvas').querySelector('iframe')
    expect(frame).toHaveAttribute('src', 'https://files.test/receipt.pdf')
    expect(screen.getByTestId('photo-canvas').querySelector('img')).toBeNull()
  })

  it('says so for a file it cannot show', async () => {
    setData(
      [],
      [
        attachment('x', 'purchase_order', {
          file: {
            id: 'file-x',
            originalFilename: 'sheet.xlsx',
            mimeType: 'application/vnd.ms-excel',
          },
        }),
      ],
    )
    await openViewer()
    await waitFor(() => {
      expect(screen.getByText('This file cannot be shown here.')).toBeInTheDocument()
    })
  })

  it('waits for the link of an attached file before drawing it', async () => {
    let release: (v: unknown) => void = () => undefined
    mockClientQuery.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    setData([], [attachment('slow', 'purchase_order')])
    await openViewer()
    expect(bigImage()).toBeNull()
    await act(async () => {
      release({ data: { fileDownloadUrl: { downloadUrl: 'https://files.test/slow.jpg' } } })
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(bigImage()).toHaveAttribute('src', 'https://files.test/slow.jpg')
    })
  })

  it('still lists a file whose link could not be fetched, without breaking the others', async () => {
    mockClientQuery.mockImplementation((opts: { variables: { fileId: string } }) =>
      opts.variables.fileId === 'file-bad'
        ? Promise.reject(new Error('nope'))
        : Promise.resolve({
            data: {
              fileDownloadUrl: { downloadUrl: `https://files.test/${opts.variables.fileId}` },
            },
          }),
    )
    setData([], [attachment('bad', 'purchase_order'), attachment('ok', 'purchase_order')])
    await openViewer()
    await waitFor(() => {
      expect(thumbs()).toHaveLength(2)
    })
    fireEvent.click(thumbs()[1])
    await waitFor(() => {
      expect(bigImage()).toHaveAttribute('src', 'https://files.test/file-ok')
    })
  })
})

describe('when there is nothing, or it fails', () => {
  it('says so for an order with no pictures yet', async () => {
    setData([])
    await openViewer()
    expect(
      screen.getByText('No receipts or photos have been added to this order yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(counter()).not.toBeInTheDocument()
  })

  it('shows that it is loading', async () => {
    state.po = { data: undefined, loading: true, error: undefined, refetch: refetchPhotos }
    await openViewer()
    expect(screen.getByRole('status')).toHaveTextContent('Loading the pictures…')
  })

  it('says it could not load, and tries again on request', async () => {
    state.po = { data: undefined, loading: false, error: new Error('boom'), refetch: refetchPhotos }
    await openViewer()
    expect(screen.getByRole('alert')).toHaveTextContent('The pictures could not be loaded.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetchPhotos).toHaveBeenCalled()
  })

  it('Refresh asks for both lists again', async () => {
    setData([receipt('r1', [photo('p1')])])
    await openViewer()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(refetchPhotos).toHaveBeenCalledTimes(1)
    expect(refetchAttachments).toHaveBeenCalledTimes(1)
  })
})

describe('a window left open', () => {
  beforeEach(() => {
    setData([receipt('r1', [photo('p1')])])
  })

  it('asks for fresh links when it is clicked back into after ten minutes', async () => {
    const now = vi.spyOn(Date, 'now')
    const t0 = 1_700_000_000_000
    now.mockReturnValue(t0)
    await openViewer()
    now.mockReturnValue(t0 + 11 * 60 * 1000)
    await act(async () => {
      fireEvent.focus(window)
      await Promise.resolve()
    })
    expect(refetchPhotos).toHaveBeenCalled()
    now.mockRestore()
  })

  it('does not, when it was only looked away from for a moment', async () => {
    const now = vi.spyOn(Date, 'now')
    const t0 = 1_700_000_000_000
    now.mockReturnValue(t0)
    await openViewer()
    now.mockReturnValue(t0 + 2 * 60 * 1000)
    fireEvent.focus(window)
    expect(refetchPhotos).not.toHaveBeenCalled()
    now.mockRestore()
  })

  it('remembers where it was put: its position and size are saved when it is resized or moved', () => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'screenX', { value: -1800, configurable: true })
    Object.defineProperty(window, 'screenY', { value: 25, configurable: true })
    Object.defineProperty(window, 'outerWidth', { value: 950, configurable: true })
    Object.defineProperty(window, 'outerHeight', { value: 760, configurable: true })
    render(
      <MemoryRouter initialEntries={['/viewer/purchase-orders/po-1/photos']}>
        <ThemeProvider>
          <Routes>
            <Route path="/viewer/purchase-orders/:id/photos" element={<PoPhotoViewerPage />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
    )
    fireEvent(window, new Event('resize'))
    expect(JSON.parse(localStorage.getItem('fnc_po_photo_viewer_window') ?? 'null')).toEqual({
      left: -1800,
      top: 25,
      width: 950,
      height: 760,
    })
    // moved to another place: the timer notices it
    Object.defineProperty(window, 'screenX', { value: 2400, configurable: true })
    act(() => {
      vi.advanceTimersByTime(1600)
    })
    expect(JSON.parse(localStorage.getItem('fnc_po_photo_viewer_window') ?? 'null')).toMatchObject({
      left: 2400,
    })
    vi.useRealTimers()
  })
})

describe('drawn into another window (the floating picture-in-picture window)', () => {
  // an iframe stands in for the other window: it has its own window and document, like a floating one does
  function otherWindow(): Window {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    if (!frame.contentWindow) throw new Error('no frame window')
    return frame.contentWindow
  }
  async function openIn(win: Window, props: { saveGeometry?: boolean } = {}) {
    const { PoPhotoViewer } = await import('../../../components/procurement/PoPhotoViewer')
    render(
      <ThemeProvider>
        <PoPhotoViewer poId="po-1" win={win} {...props} />
      </ThemeProvider>,
    )
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('listens for the arrow keys in that window, not in the one that opened it', async () => {
    setData([receipt('r1', [photo('p1'), photo('p2'), photo('p3')])])
    const win = otherWindow()
    await openIn(win)
    expect(counter()).toHaveTextContent('1 of 3')
    // a key in the main window is for the main page
    press('ArrowRight')
    expect(counter()).toHaveTextContent('1 of 3')
    fireEvent.keyDown(win, { key: 'ArrowRight' })
    expect(counter()).toHaveTextContent('2 of 3')
  })

  it('names that window after the PO', async () => {
    setData([receipt('r1', [photo('p1')])])
    const win = otherWindow()
    await openIn(win)
    expect(win.document.title).toBe('PO-2026-0056 · Receipts & photos')
  })

  it('does not save a position for a floating window (the browser places it), but does for a pop-up', async () => {
    setData([receipt('r1', [photo('p1')])])
    const win = otherWindow()
    Object.defineProperty(win, 'outerWidth', { value: 900, configurable: true })
    Object.defineProperty(win, 'outerHeight', { value: 700, configurable: true })
    await openIn(win)
    fireEvent(win, new Event('resize'))
    expect(localStorage.getItem('fnc_po_photo_viewer_window')).toBeNull()
  })

  it('saves the position of a pop-up window it is told to remember', async () => {
    setData([receipt('r1', [photo('p1')])])
    const win = otherWindow()
    Object.defineProperty(win, 'screenX', { value: -1400, configurable: true })
    Object.defineProperty(win, 'screenY', { value: 10, configurable: true })
    Object.defineProperty(win, 'outerWidth', { value: 900, configurable: true })
    Object.defineProperty(win, 'outerHeight', { value: 700, configurable: true })
    await openIn(win, { saveGeometry: true })
    fireEvent(win, new Event('resize'))
    expect(JSON.parse(localStorage.getItem('fnc_po_photo_viewer_window') ?? 'null')).toEqual({
      left: -1400,
      top: 10,
      width: 900,
      height: 700,
    })
  })
})
