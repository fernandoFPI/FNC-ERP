import '@testing-library/jest-dom'
// Initialise i18next (English by default) so components calling useTranslation() render real strings.
import './i18n'

// jsdom doesn't implement ResizeObserver; every real browser does.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {
      /* noop stub */
    }
    unobserve() {
      /* noop stub */
    }
    disconnect() {
      /* noop stub */
    }
  }
}
