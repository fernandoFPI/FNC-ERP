// The one picture or PDF an invoice prints after its last page.
//
// The server (services/gateway/src/lib/invoicePrintAttachment.ts) is the authority on what may be attached; the numbers
// here only let the page say "no" before an upload that would be refused, and a test pins them to the server file.
// A PDF is turned into one picture per page (lib/pdfToImages.ts) because the printed invoice is an HTML page in an
// iframe, which cannot embed a PDF in a way that prints.

export const PRINT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
/** Sheets an attachment may add to the printout; a longer PDF is refused rather than cut. */
export const PRINT_ATTACHMENT_MAX_PAGES = 10
export const PRINT_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const
export const PRINT_ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf'

export type PrintAttachmentMime = (typeof PRINT_ATTACHMENT_MIME_TYPES)[number]

const MIME_BY_EXTENSION: Record<string, PrintAttachmentMime> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
}

const isAllowedMime = (t: string): t is PrintAttachmentMime =>
  (PRINT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(t)

/**
 * The type to upload this file as, or null when it is not a JPG, PNG or PDF. A browser reports '' (or the generic
 * octet-stream) for a type the PC has no program registered for, so those fall back to the extension; any other type
 * the browser names must be one of the three, never guessed from the name.
 */
export function printAttachmentMime(file: {
  name: string
  type: string
}): PrintAttachmentMime | null {
  const t = file.type.trim().toLowerCase()
  if (isAllowedMime(t)) return t
  if (t === '' || t === 'application/octet-stream') {
    const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : ''
    return MIME_BY_EXTENSION[ext] ?? null
  }
  return null
}

export type PrintAttachmentPick =
  | { ok: true; mime: PrintAttachmentMime }
  | { ok: false; problem: 'type' | 'size' | 'empty' }

/** First look at a chosen file, before anything is read or uploaded. */
export function checkPrintAttachmentPick(file: {
  name: string
  type: string
  size: number
}): PrintAttachmentPick {
  const mime = printAttachmentMime(file)
  if (!mime) return { ok: false, problem: 'type' }
  if (file.size <= 0) return { ok: false, problem: 'empty' }
  if (file.size > PRINT_ATTACHMENT_MAX_BYTES) return { ok: false, problem: 'size' }
  return { ok: true, mime }
}

/** The first bytes of a JPG / PNG / PDF; a renamed file of another kind fails here instead of printing as a broken image. */
export function bytesMatchMime(head: Uint8Array, mime: PrintAttachmentMime): boolean {
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b)
  switch (mime) {
    case 'image/jpeg':
      return starts([0xff, 0xd8, 0xff])
    case 'image/png':
      return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'application/pdf':
      // Some tools put a few bytes before %PDF; the spec lets it sit in the first 1024.
      return new TextDecoder('latin1').decode(head.subarray(0, 1024)).includes('%PDF-')
  }
}

/** The bytes of a chosen file. FileReader, not Blob.arrayBuffer(): older browsers and the test DOM lack the latter. */
export function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('The file could not be read'))
    }
    reader.readAsArrayBuffer(file)
  })
}

/** base64 of the bytes, built in chunks (a single String.fromCharCode(...bytes) overflows the stack on a large file). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function imageDataUrl(bytes: Uint8Array, mime: 'image/jpeg' | 'image/png'): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

/** "1.2 MB" / "340 KB" for the file line. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// Pages already rendered for a file this session, so switching tabs, or a refetch of the invoice, does not download and
// render the same PDF again. Small on purpose: each entry is a few MB of picture data.
const PAGE_CACHE_LIMIT = 3
const pageCache = new Map<string, string[]>()

export function cachedAttachmentPages(fileId: string): string[] | undefined {
  return pageCache.get(fileId)
}

export function rememberAttachmentPages(fileId: string, pages: string[]): void {
  pageCache.delete(fileId)
  pageCache.set(fileId, pages)
  while (pageCache.size > PAGE_CACHE_LIMIT) {
    const oldest = pageCache.keys().next().value
    if (oldest === undefined) break
    pageCache.delete(oldest)
  }
}

export function forgetAttachmentPages(fileId: string): void {
  pageCache.delete(fileId)
}
