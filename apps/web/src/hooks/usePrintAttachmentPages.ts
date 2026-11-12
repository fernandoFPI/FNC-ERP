import { useEffect, useState } from 'react'
import { cachedAttachmentPages, type PrintAttachmentMime } from '../lib/invoicePrintAttachment'
import {
  PrintAttachmentError,
  loadPrintAttachmentPages,
  type PrintAttachmentFailure,
} from '../lib/loadPrintAttachment'

export type AttachmentPagesState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; pages: string[] }
  | {
      status: 'failed'
      reason: PrintAttachmentFailure
      detail?: { pageCount: number; maxPages: number }
    }

type Loaded =
  | { fileId: string; status: 'ready'; pages: string[] }
  | {
      fileId: string
      status: 'failed'
      reason: PrintAttachmentFailure
      detail?: { pageCount: number; maxPages: number }
    }

const KNOWN_MIME = ['image/jpeg', 'image/png', 'application/pdf']
const asMime = (m: string): PrintAttachmentMime | null =>
  KNOWN_MIME.includes(m) ? (m as PrintAttachmentMime) : null

/**
 * The printable pages of an invoice's attachment, loaded while `enabled` (the PDF tab is open). The result belongs to a
 * file id, so a state left over from the previous attachment is never shown for a new one: for one render after a
 * replace the answer is "loading", not the old pages. Returns `retry` for a failed download.
 */
export function usePrintAttachmentPages(
  att: { fileId: string; mimeType: string } | null | undefined,
  enabled: boolean,
): { state: AttachmentPagesState; retry: () => void } {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const fileId = att?.fileId ?? null
  const mimeType = att?.mimeType ?? null

  useEffect(() => {
    if (!fileId || !mimeType || !enabled) return
    if (cachedAttachmentPages(fileId)) return
    const mime = asMime(mimeType)
    if (!mime) {
      setLoaded({ fileId, status: 'failed', reason: 'unreadable' })
      return
    }
    let cancelled = false
    loadPrintAttachmentPages({ fileId, mime })
      .then((pages) => {
        if (!cancelled) setLoaded({ fileId, status: 'ready', pages })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof PrintAttachmentError)
          setLoaded({ fileId, status: 'failed', reason: err.reason, detail: err.detail })
        else setLoaded({ fileId, status: 'failed', reason: 'download' })
      })
    return () => {
      cancelled = true
    }
  }, [fileId, mimeType, enabled, attempt])

  const retry = () => {
    setLoaded(null)
    setAttempt((a) => a + 1)
  }

  if (!fileId) return { state: { status: 'none' }, retry }
  const cached = cachedAttachmentPages(fileId)
  if (cached) return { state: { status: 'ready', pages: cached }, retry }
  if (loaded?.fileId === fileId) {
    return {
      state:
        loaded.status === 'ready'
          ? { status: 'ready', pages: loaded.pages }
          : { status: 'failed', reason: loaded.reason, detail: loaded.detail },
      retry,
    }
  }
  return { state: { status: 'loading' }, retry }
}
