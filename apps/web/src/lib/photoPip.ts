// A floating "picture-in-picture" window for the receipts-and-photos viewer. Unlike a pop-up window it has no address bar (only a
// thin title bar), it stays above the other windows and can be dragged to a second screen. It is the browser's Document
// Picture-in-Picture API (Chrome and Edge 116 and later); a browser without it gets the pop-up window instead.

export interface DocumentPipApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
}

/** The browser's Document Picture-in-Picture API, or null when it has none. */
export function documentPipApi(w: Window = window): DocumentPipApi | null {
  const api = (w as Window & { documentPictureInPicture?: DocumentPipApi }).documentPictureInPicture
  return api && typeof api.requestWindow === 'function' ? api : null
}

export const PIP_SIZE = { width: 900, height: 700 }

/**
 * Gives a new window the look of this one. A picture-in-picture window starts empty: no style sheets, no theme variables. Every
 * style sheet of the page is copied (rules where they can be read, else a link to the file), and so are the attributes of the
 * root element (language, direction, theme) and its inline style (the theme's CSS variables).
 */
export function copyDocumentStyles(from: Document, to: Document): void {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('')
      const style = to.createElement('style')
      style.textContent = css
      to.head.appendChild(style)
    } catch {
      // a sheet from another origin cannot be read: link to it instead
      if (sheet.href) {
        const link = to.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        to.head.appendChild(link)
      }
    }
  }
  for (const attr of Array.from(from.documentElement.attributes)) {
    to.documentElement.setAttribute(attr.name, attr.value)
  }
  to.body.style.margin = '0'
}
