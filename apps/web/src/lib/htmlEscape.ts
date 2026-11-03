// Helpers for the modules that build a whole HTML document as a string (invoiceHtml, and the
// other *Html.ts builders) and show it in an iframe through `srcDoc`.
//
// An iframe with no `sandbox` runs the document's scripts with the app's own origin, so any
// text from the database that reaches the page as markup (a line description, a client name,
// a bank detail) is a stored script injection. Text therefore goes through esc(); image
// sources go through safeImageSrc(), because a value placed inside a CSS url('...') or an
// attribute can end the quote and carry markup with it.

/** Text from the database, as text. Safe in element content and in a double- or single-quoted attribute. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// data:image/<type>[;param...],<payload>  with a payload that cannot contain a quote, bracket,
// parenthesis or whitespace (base64, or percent-encoded SVG).
const DATA_IMAGE =
  /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)(?:;[a-z0-9=.+-]+)*,[A-Za-z0-9+/=%._~!*-]*$/i
const HTTP_URL = /^https?:\/\/[^\s'"()<>\\]+$/i

/** An image source that is safe to put in an `src` attribute or a CSS `url('...')`, or null. */
export function safeImageSrc(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  return DATA_IMAGE.test(v) || HTTP_URL.test(v) ? v : null
}
