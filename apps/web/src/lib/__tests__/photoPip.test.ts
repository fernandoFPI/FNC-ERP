// The floating picture-in-picture window of the photo viewer: finding the browser's API, and making a new empty window look like
// the app (style sheets, language, direction, theme).
import { describe, it, expect, afterEach } from 'vitest'
import { documentPipApi, copyDocumentStyles, PIP_SIZE } from '../photoPip'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach((s) => {
    s.remove()
  })
  for (const a of ['dir', 'lang', 'data-theme', 'style'])
    document.documentElement.removeAttribute(a)
})

const freshDocument = () => document.implementation.createHTMLDocument('pip')

describe('documentPipApi', () => {
  it('is the browser API when it has one', () => {
    const api = { requestWindow: () => Promise.resolve({} as Window) }
    expect(documentPipApi({ documentPictureInPicture: api } as unknown as Window)).toBe(api)
  })

  it('is null in a browser without it', () => {
    expect(documentPipApi({} as unknown as Window)).toBeNull()
  })

  it('is null when what is there is not usable', () => {
    expect(documentPipApi({ documentPictureInPicture: {} } as unknown as Window)).toBeNull()
    expect(documentPipApi({ documentPictureInPicture: null } as unknown as Window)).toBeNull()
  })

  it('asks for a window big enough to read a receipt', () => {
    expect(PIP_SIZE.width).toBeGreaterThanOrEqual(800)
    expect(PIP_SIZE.height).toBeGreaterThanOrEqual(600)
  })
})

describe('copyDocumentStyles', () => {
  it('copies the rules of every style sheet of the page', () => {
    const style = document.createElement('style')
    style.setAttribute('data-test', '1')
    style.textContent = '.viewer-test-rule { color: red; }'
    document.head.appendChild(style)
    const to = freshDocument()
    copyDocumentStyles(document, to)
    const copied = Array.from(to.head.querySelectorAll('style')).map((s) => s.textContent)
    expect(copied.some((css) => css.includes('.viewer-test-rule'))).toBe(true)
  })

  it('links to a sheet whose rules cannot be read (another origin) instead of dropping it', () => {
    const from = {
      styleSheets: [
        {
          get cssRules(): CSSRuleList {
            throw new DOMException('blocked', 'SecurityError')
          },
          href: 'https://fonts.example.com/inter.css',
        },
      ],
      documentElement: { attributes: [] },
    } as unknown as Document
    const to = freshDocument()
    copyDocumentStyles(from, to)
    // (jest-dom refuses an element of a document with no window, so read the attribute directly)
    const link = to.head.querySelector('link[rel="stylesheet"]')
    expect(link?.getAttribute('href')).toBe('https://fonts.example.com/inter.css')
  })

  it('drops an unreadable sheet that has no address (nothing to link to) without failing', () => {
    const from = {
      styleSheets: [
        {
          get cssRules(): CSSRuleList {
            throw new DOMException('blocked', 'SecurityError')
          },
          href: null,
        },
      ],
      documentElement: { attributes: [] },
    } as unknown as Document
    const to = freshDocument()
    expect(() => {
      copyDocumentStyles(from, to)
    }).not.toThrow()
    expect(to.head.querySelectorAll('link,style')).toHaveLength(0)
  })

  it('carries the language, the direction, the theme and the theme variables to the new window', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    document.documentElement.setAttribute('lang', 'ar')
    document.documentElement.setAttribute('data-theme', 'black')
    document.documentElement.setAttribute('style', '--border-field: #123456;')
    const to = freshDocument()
    copyDocumentStyles(document, to)
    expect(to.documentElement.getAttribute('dir')).toBe('rtl')
    expect(to.documentElement.getAttribute('lang')).toBe('ar')
    expect(to.documentElement.getAttribute('data-theme')).toBe('black')
    expect(to.documentElement.getAttribute('style')).toContain('--border-field')
  })

  it('takes the default margin off the new window body', () => {
    const to = freshDocument()
    copyDocumentStyles(document, to)
    expect(to.body.style.margin).toBe('0px')
  })
})
