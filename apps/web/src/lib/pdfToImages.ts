// A PDF as one picture per page.
//
// Used for the attachment an invoice prints after its last page. The printed invoice is an HTML document shown in an
// iframe, and Chrome prints an embedded PDF as a grey box, not as pages. Drawing each page to a canvas gives pictures
// that print identically everywhere, at the cost that the text in them is no longer selectable (a copy of a purchase
// order or an approval letter, which is read, not copied from).
//
// pdfjs is imported on demand: it is large and only this tab needs it.

/** Width of a rendered A4 page in pixels (about 200 dpi): sharp in print, a few hundred KB a page as JPEG. */
const TARGET_WIDTH_PX = 1654
const MAX_SCALE = 3
const JPEG_QUALITY = 0.88

/** The PDF has more pages than may be printed with the invoice. Nothing is cut: the attachment is refused. */
export class PdfTooLongError extends Error {
  constructor(
    readonly pageCount: number,
    readonly maxPages: number,
  ) {
    super(`PDF has ${pageCount} pages; at most ${maxPages} may be attached`)
    this.name = 'PdfTooLongError'
  }
}

/** Damaged, encrypted, or not a PDF at all. */
export class PdfUnreadableError extends Error {
  constructor(cause?: unknown) {
    super(cause instanceof Error ? cause.message : 'The PDF could not be read')
    this.name = 'PdfUnreadableError'
  }
}

/**
 * Every page of the PDF as a JPEG data URL, in order. Throws PdfTooLongError before drawing anything when the page count
 * is over `maxPages`, and PdfUnreadableError when pdfjs cannot open it. pdfjs takes ownership of the bytes it is given
 * (it transfers them to its worker), so do not reuse `data` afterwards.
 */
export async function renderPdfPages(data: Uint8Array, maxPages: number): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const task = pdfjs.getDocument({ data })
  let doc: Awaited<typeof task.promise>
  try {
    doc = await task.promise
  } catch (err) {
    void task.destroy()
    throw new PdfUnreadableError(err)
  }

  try {
    if (doc.numPages > maxPages) throw new PdfTooLongError(doc.numPages, maxPages)
    const pages: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      try {
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(MAX_SCALE, TARGET_WIDTH_PX / base.width)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Failed to get a 2D canvas context')
        // JPEG has no transparency: a page drawn on a clear canvas would print black where it is blank.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, canvas, viewport }).promise
        pages.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
        canvas.width = 0
        canvas.height = 0
      } finally {
        page.cleanup()
      }
    }
    return pages
  } finally {
    // Frees the worker and the decoded pages; the loading task owns both, the document proxy has no destroy of its own.
    void task.destroy()
  }
}
