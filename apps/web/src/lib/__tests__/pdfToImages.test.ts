import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// pdfjs needs a worker and a real canvas; neither exists in jsdom. These tests pin how pdf-to-images USES it (its order
// of calls, its limits, what it frees); that the real pdfjs draws real pages was checked in headless Chrome.
const calls: string[] = []
let numPages = 3
let pageWidthPt = 595 // an A4 page is 595 pt wide
let getDocumentError: Error | null = null
let renderError: Error | null = null

const task = {
  promise: Promise.resolve(),
  destroy: vi.fn(() => {
    calls.push('task.destroy')
    return Promise.resolve()
  }),
}

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => {
    calls.push('getDocument')
    task.promise = getDocumentError
      ? Promise.reject(getDocumentError)
      : Promise.resolve({
          numPages,
          getPage: (n: number) => {
            calls.push(`getPage ${n}`)
            return Promise.resolve({
              getViewport: ({ scale }: { scale: number }) => ({
                width: pageWidthPt * scale,
                height: 842 * scale,
              }),
              render: () => {
                calls.push('render')
                return { promise: renderError ? Promise.reject(renderError) : Promise.resolve() }
              },
              cleanup: () => {
                calls.push('page.cleanup')
              },
            })
          },
        })
    return task
  }),
}))

import { PdfTooLongError, PdfUnreadableError, renderPdfPages } from '../pdfToImages'

const ctx = {
  fillStyle: '',
  fillRect: vi.fn((..._a: number[]) => {
    calls.push('fillRect')
  }),
}
let canvases: HTMLCanvasElement[] = []

beforeEach(() => {
  calls.length = 0
  numPages = 3
  pageWidthPt = 595
  getDocumentError = null
  renderError = null
  ctx.fillStyle = ''
  ctx.fillRect.mockClear()
  task.destroy.mockClear()
  canvases = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => ctx) as unknown as HTMLCanvasElement['getContext'],
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    canvases.push(this)
    return `data:image/jpeg;base64,PAGE${canvases.length}`
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('renderPdfPages', () => {
  it('returns one JPEG per page, in page order', async () => {
    const pages = await renderPdfPages(new Uint8Array([1]), 10)
    expect(pages).toEqual([
      'data:image/jpeg;base64,PAGE1',
      'data:image/jpeg;base64,PAGE2',
      'data:image/jpeg;base64,PAGE3',
    ])
    expect(calls.filter((c) => c.startsWith('getPage'))).toEqual([
      'getPage 1',
      'getPage 2',
      'getPage 3',
    ])
  })

  it('draws a white page first (a JPEG has no transparency, a blank part would print black), then the page', async () => {
    await renderPdfPages(new Uint8Array([1]), 10)
    expect(ctx.fillStyle).toBe('#ffffff')
    const first = calls.indexOf('fillRect')
    expect(first).toBeGreaterThan(-1)
    expect(calls.indexOf('render')).toBeGreaterThan(first)
  })

  describe('how big the picture is', () => {
    const widthFor = async (pt: number) => {
      const widths: number[] = []
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
        this: HTMLCanvasElement,
      ) {
        widths.push(this.width)
        return 'data:image/jpeg;base64,X'
      })
      numPages = 1
      pageWidthPt = pt
      await renderPdfPages(new Uint8Array([1]), 10)
      return widths[0]
    }

    it('an A4 page is drawn about 1654 px wide (about 200 dpi), whatever its size in points', async () => {
      expect(await widthFor(595)).toBe(1654)
      expect(await widthFor(842)).toBe(1654) // a landscape A4 sheet
      expect(await widthFor(1200)).toBe(1654) // a large drawing is brought down to the same width
    })

    it('a tiny page is enlarged at most three times, not blown up without limit', async () => {
      expect(await widthFor(200)).toBe(600)
    })
  })

  it('refuses a PDF over the limit BEFORE drawing anything, naming both numbers, and frees pdfjs', async () => {
    numPages = 12
    const err = await renderPdfPages(new Uint8Array([1]), 10).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PdfTooLongError)
    expect((err as PdfTooLongError).pageCount).toBe(12)
    expect((err as PdfTooLongError).maxPages).toBe(10)
    expect(calls.some((c) => c.startsWith('getPage'))).toBe(false)
    expect(calls).toContain('task.destroy')
  })

  it('exactly the limit is allowed', async () => {
    numPages = 10
    expect(await renderPdfPages(new Uint8Array([1]), 10)).toHaveLength(10)
  })

  it('a PDF pdfjs cannot open (damaged, encrypted) is "unreadable", and pdfjs is freed', async () => {
    getDocumentError = new Error('Invalid PDF structure')
    const err = await renderPdfPages(new Uint8Array([1]), 10).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PdfUnreadableError)
    expect((err as Error).message).toBe('Invalid PDF structure')
    expect(calls).toContain('task.destroy')
  })

  it('a page that fails to draw fails the whole PDF (never a printout with a page missing), and still frees pdfjs', async () => {
    renderError = new Error('render failed')
    await expect(renderPdfPages(new Uint8Array([1]), 10)).rejects.toThrow('render failed')
    expect(calls).toContain('page.cleanup')
    expect(calls).toContain('task.destroy')
  })

  it('frees each page after it is drawn, and the document once at the end', async () => {
    await renderPdfPages(new Uint8Array([1]), 10)
    expect(calls.filter((c) => c === 'page.cleanup')).toHaveLength(3)
    expect(task.destroy).toHaveBeenCalledTimes(1)
    expect(calls[calls.length - 1]).toBe('task.destroy')
  })

  it('a missing canvas context is an error, not a blank page', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => null) as unknown as HTMLCanvasElement['getContext'],
    )
    await expect(renderPdfPages(new Uint8Array([1]), 10)).rejects.toThrow(/canvas context/)
  })

  it('shrinks each canvas to nothing once its picture is taken (a 10-page PDF otherwise holds ten large bitmaps)', async () => {
    await renderPdfPages(new Uint8Array([1]), 10)
    expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true)
  })
})
