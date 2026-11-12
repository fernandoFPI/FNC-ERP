import { api } from './axios'
import {
  PRINT_ATTACHMENT_MAX_PAGES,
  bytesMatchMime,
  cachedAttachmentPages,
  imageDataUrl,
  rememberAttachmentPages,
  type PrintAttachmentMime,
} from './invoicePrintAttachment'
import { PdfTooLongError, renderPdfPages } from './pdfToImages'

/** Why the attachment could not be turned into printable pages. */
export type PrintAttachmentFailure = 'tooLong' | 'unreadable' | 'download'

export class PrintAttachmentError extends Error {
  constructor(
    readonly reason: PrintAttachmentFailure,
    readonly detail?: { pageCount: number; maxPages: number },
  ) {
    super(`Print attachment: ${reason}`)
    this.name = 'PrintAttachmentError'
  }
}

/** The pages of a file's bytes: the picture itself, or one picture per PDF page. Checks the bytes are what the type says. */
export async function pagesFromBytes(
  bytes: Uint8Array,
  mime: PrintAttachmentMime,
): Promise<string[]> {
  if (!bytesMatchMime(bytes.subarray(0, 1024), mime)) throw new PrintAttachmentError('unreadable')
  if (mime === 'application/pdf') {
    try {
      return await renderPdfPages(bytes, PRINT_ATTACHMENT_MAX_PAGES)
    } catch (err) {
      if (err instanceof PdfTooLongError)
        throw new PrintAttachmentError('tooLong', {
          pageCount: err.pageCount,
          maxPages: err.maxPages,
        })
      throw new PrintAttachmentError('unreadable')
    }
  }
  return [imageDataUrl(bytes, mime)]
}

/**
 * The printable pages of an invoice's attachment. The bytes come through the gateway (same origin, company-scoped),
 * not from storage directly, so no storage CORS rules are involved. Pages already built this session are reused.
 */
export async function loadPrintAttachmentPages(att: {
  fileId: string
  mime: PrintAttachmentMime
}): Promise<string[]> {
  const cached = cachedAttachmentPages(att.fileId)
  if (cached) return cached

  let bytes: Uint8Array
  try {
    const res = await api.get<ArrayBuffer>(`/files/${att.fileId}/content`, {
      responseType: 'arraybuffer',
    })
    bytes = new Uint8Array(res.data)
  } catch {
    throw new PrintAttachmentError('download')
  }
  const pages = await pagesFromBytes(bytes, att.mime)
  rememberAttachmentPages(att.fileId, pages)
  return pages
}
