import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiGet = vi.fn()
vi.mock('../axios', () => ({ api: { get: (...a: unknown[]): unknown => apiGet(...a) } }))

const renderPdfPages = vi.fn()
vi.mock('../pdfToImages', () => {
  class PdfTooLongError extends Error {
    constructor(
      readonly pageCount: number,
      readonly maxPages: number,
    ) {
      super('too long')
    }
  }
  return { PdfTooLongError, renderPdfPages: (...a: unknown[]): unknown => renderPdfPages(...a) }
})

import { PdfTooLongError } from '../pdfToImages'
import {
  PrintAttachmentError,
  loadPrintAttachmentPages,
  pagesFromBytes,
} from '../loadPrintAttachment'
import { cachedAttachmentPages, forgetAttachmentPages } from '../invoicePrintAttachment'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9])
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n...')

beforeEach(() => {
  apiGet.mockReset()
  renderPdfPages.mockReset()
  for (const id of ['f1', 'f2', 'f3']) forgetAttachmentPages(id)
})

describe('pagesFromBytes', () => {
  it('a picture is one page, a data URL of its own bytes and type', async () => {
    expect(await pagesFromBytes(PNG_BYTES, 'image/png')).toEqual([
      `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`,
    ])
    expect(await pagesFromBytes(JPG_BYTES, 'image/jpeg')).toEqual([
      `data:image/jpeg;base64,${Buffer.from(JPG_BYTES).toString('base64')}`,
    ])
    expect(renderPdfPages).not.toHaveBeenCalled()
  })

  it('a PDF is drawn page by page with the ten-page limit', async () => {
    renderPdfPages.mockResolvedValue(['a', 'b'])
    expect(await pagesFromBytes(PDF_BYTES, 'application/pdf')).toEqual(['a', 'b'])
    expect(renderPdfPages).toHaveBeenCalledWith(PDF_BYTES, 10)
  })

  it('bytes that are not what the type says are "unreadable", before anything is drawn', async () => {
    for (const [bytes, mime] of [
      [JPG_BYTES, 'image/png'],
      [PNG_BYTES, 'image/jpeg'],
      [new TextEncoder().encode('<html>'), 'application/pdf'],
    ] as const) {
      const err = await pagesFromBytes(bytes, mime).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(PrintAttachmentError)
      expect((err as PrintAttachmentError).reason).toBe('unreadable')
    }
    expect(renderPdfPages).not.toHaveBeenCalled()
  })

  it('a PDF over the limit is "tooLong" and carries both numbers', async () => {
    renderPdfPages.mockRejectedValue(new PdfTooLongError(12, 10))
    const err = await pagesFromBytes(PDF_BYTES, 'application/pdf').catch((e: unknown) => e)
    expect((err as PrintAttachmentError).reason).toBe('tooLong')
    expect((err as PrintAttachmentError).detail).toEqual({ pageCount: 12, maxPages: 10 })
  })

  it('any other failure while drawing is "unreadable"', async () => {
    renderPdfPages.mockRejectedValue(new Error('worker crashed'))
    const err = await pagesFromBytes(PDF_BYTES, 'application/pdf').catch((e: unknown) => e)
    expect((err as PrintAttachmentError).reason).toBe('unreadable')
  })
})

describe('loadPrintAttachmentPages', () => {
  it('downloads the bytes through the gateway as an arraybuffer, builds the pages and keeps them', async () => {
    apiGet.mockResolvedValue({ data: PNG_BYTES.buffer })
    const pages = await loadPrintAttachmentPages({ fileId: 'f1', mime: 'image/png' })
    expect(apiGet).toHaveBeenCalledWith('/files/f1/content', { responseType: 'arraybuffer' })
    expect(pages).toHaveLength(1)
    expect(cachedAttachmentPages('f1')).toEqual(pages)
  })

  it('the second time it does not download again', async () => {
    apiGet.mockResolvedValue({ data: PNG_BYTES.buffer })
    const first = await loadPrintAttachmentPages({ fileId: 'f2', mime: 'image/png' })
    const second = await loadPrintAttachmentPages({ fileId: 'f2', mime: 'image/png' })
    expect(second).toEqual(first)
    expect(apiGet).toHaveBeenCalledTimes(1)
  })

  it('a failed download is "download" (worth a retry), and nothing is kept', async () => {
    apiGet.mockRejectedValue(new Error('Network Error'))
    const err = await loadPrintAttachmentPages({ fileId: 'f3', mime: 'image/png' }).catch(
      (e: unknown) => e,
    )
    expect((err as PrintAttachmentError).reason).toBe('download')
    expect(cachedAttachmentPages('f3')).toBeUndefined()
  })

  it('a file that downloads but is not valid is not kept either', async () => {
    apiGet.mockResolvedValue({ data: JPG_BYTES.buffer })
    const err = await loadPrintAttachmentPages({ fileId: 'f3', mime: 'image/png' }).catch(
      (e: unknown) => e,
    )
    expect((err as PrintAttachmentError).reason).toBe('unreadable')
    expect(cachedAttachmentPages('f3')).toBeUndefined()
  })
})
