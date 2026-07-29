import '@testing-library/jest-dom'

// jsdom doesn't implement ResizeObserver; every real browser does.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
