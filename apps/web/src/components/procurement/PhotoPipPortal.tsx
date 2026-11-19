import { createPortal } from 'react-dom'
import { PoPhotoViewer } from './PoPhotoViewer'

/**
 * Draws the receipts-and-photos viewer into a picture-in-picture window. It is a portal, so the viewer stays part of this page's
 * React tree: the language, the theme and the data connection are the page's own, and it closes with the page.
 */
export function PhotoPipPortal({ win, poId }: { win: Window; poId: string }) {
  return createPortal(<PoPhotoViewer poId={poId} win={win} />, win.document.body)
}
