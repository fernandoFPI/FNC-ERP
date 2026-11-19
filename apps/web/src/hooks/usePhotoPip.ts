import { useCallback, useEffect, useRef, useState } from 'react'
import { copyDocumentStyles, documentPipApi, PIP_SIZE } from '../lib/photoPip'

export interface PhotoPip {
  /** The floating window while it is open (the viewer is drawn into it), else null. */
  win: Window | null
  /** Opens the window, or brings it forward. Resolves false when the browser has no picture-in-picture window or refused it. */
  open: () => Promise<boolean>
}

/**
 * Owns the picture-in-picture window of the receipts-and-photos viewer. It lives as long as the page that calls this hook: it is
 * closed when that page goes away (a picture-in-picture window cannot outlive the page that opened it).
 */
export function usePhotoPip(): PhotoPip {
  const [win, setWin] = useState<Window | null>(null)
  const current = useRef<Window | null>(null)

  useEffect(
    () => () => {
      current.current?.close()
      current.current = null
    },
    [],
  )

  const open = useCallback(async (): Promise<boolean> => {
    const api = documentPipApi()
    if (!api) return false
    if (current.current && !current.current.closed) {
      current.current.focus()
      return true
    }
    try {
      const w = await api.requestWindow({ ...PIP_SIZE })
      copyDocumentStyles(document, w.document)
      w.addEventListener('pagehide', () => {
        if (current.current === w) {
          current.current = null
          setWin(null)
        }
      })
      current.current = w
      setWin(w)
      return true
    } catch {
      // refused (no user gesture, or the browser said no): the caller falls back to a pop-up window
      return false
    }
  }, [])

  return { win, open }
}
