import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  PRINT_ATTACHMENT_MAX_BYTES,
  PRINT_ATTACHMENT_MAX_PAGES,
  PRINT_ATTACHMENT_MIME_TYPES,
  bytesMatchMime,
  bytesToBase64,
  cachedAttachmentPages,
  checkPrintAttachmentPick,
  forgetAttachmentPages,
  formatFileSize,
  imageDataUrl,
  printAttachmentMime,
  readFileBytes,
  rememberAttachmentPages,
} from '../invoicePrintAttachment'

const file = (name: string, type: string, size = 1000) => ({ name, type, size })
const bytes = (...b: number[]) => new Uint8Array(b)

describe('printAttachmentMime', () => {
  it("takes the browser's type when it is one of the three", () => {
    expect(printAttachmentMime(file('a.bin', 'image/jpeg'))).toBe('image/jpeg')
    expect(printAttachmentMime(file('a.bin', 'image/png'))).toBe('image/png')
    expect(printAttachmentMime(file('a.bin', 'application/pdf'))).toBe('application/pdf')
    expect(printAttachmentMime(file('a.bin', 'IMAGE/PNG'))).toBe('image/png')
  })

  it('falls back to the extension only when the browser could not tell (empty or octet-stream)', () => {
    expect(printAttachmentMime(file('scan.JPG', ''))).toBe('image/jpeg')
    expect(printAttachmentMime(file('scan.jpeg', 'application/octet-stream'))).toBe('image/jpeg')
    expect(printAttachmentMime(file('scan.png', ''))).toBe('image/png')
    expect(printAttachmentMime(file('po.copy.PDF', ''))).toBe('application/pdf')
  })

  it('refuses everything else, and never trusts a name over a type the browser did name', () => {
    expect(printAttachmentMime(file('po.pdf', 'image/gif'))).toBeNull()
    expect(printAttachmentMime(file('po.pdf', 'text/html'))).toBeNull()
    expect(printAttachmentMime(file('a.svg', 'image/svg+xml'))).toBeNull()
    expect(printAttachmentMime(file('a.zip', ''))).toBeNull()
    expect(printAttachmentMime(file('noextension', ''))).toBeNull()
    expect(printAttachmentMime(file('trailingdot.', ''))).toBeNull()
  })
})

describe('checkPrintAttachmentPick', () => {
  it('accepts a normal file and returns the type to upload it as', () => {
    expect(checkPrintAttachmentPick(file('a.pdf', 'application/pdf', 54_321))).toEqual({
      ok: true,
      mime: 'application/pdf',
    })
  })

  it('exactly 10 MB passes, one byte more is "size"', () => {
    expect(
      checkPrintAttachmentPick(file('a.png', 'image/png', PRINT_ATTACHMENT_MAX_BYTES)).ok,
    ).toBe(true)
    expect(
      checkPrintAttachmentPick(file('a.png', 'image/png', PRINT_ATTACHMENT_MAX_BYTES + 1)),
    ).toEqual({ ok: false, problem: 'size' })
  })

  it('an empty file and a wrong type are named for what they are', () => {
    expect(checkPrintAttachmentPick(file('a.png', 'image/png', 0))).toEqual({
      ok: false,
      problem: 'empty',
    })
    expect(checkPrintAttachmentPick(file('a.gif', 'image/gif', 10))).toEqual({
      ok: false,
      problem: 'type',
    })
    // the type is judged first: a huge wrong-type file is "type", not "size"
    expect(
      checkPrintAttachmentPick(file('a.zip', 'application/zip', PRINT_ATTACHMENT_MAX_BYTES * 3)),
    ).toEqual({ ok: false, problem: 'type' })
  })
})

describe('bytesMatchMime', () => {
  it('knows the first bytes of a JPEG, a PNG and a PDF', () => {
    expect(bytesMatchMime(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBe(true)
    expect(
      bytesMatchMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), 'image/png'),
    ).toBe(true)
    expect(bytesMatchMime(new TextEncoder().encode('%PDF-1.7\n...'), 'application/pdf')).toBe(true)
  })

  it('a PDF may have a few bytes before the header', () => {
    expect(bytesMatchMime(new TextEncoder().encode('\n\n  %PDF-1.4'), 'application/pdf')).toBe(true)
  })

  it('a renamed file of another kind does not pass', () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0)
    expect(bytesMatchMime(png, 'image/jpeg')).toBe(false)
    expect(bytesMatchMime(jpeg, 'image/png')).toBe(false)
    expect(bytesMatchMime(jpeg, 'application/pdf')).toBe(false)
    expect(
      bytesMatchMime(new TextEncoder().encode('<html>not a pdf</html>'), 'application/pdf'),
    ).toBe(false)
    expect(bytesMatchMime(new Uint8Array(0), 'image/png')).toBe(false)
    // a PNG that is cut short is not a PNG
    expect(bytesMatchMime(bytes(0x89, 0x50, 0x4e), 'image/png')).toBe(false)
  })
})

describe('base64 and data URLs', () => {
  it("matches Node's own base64 for a file far larger than one argument list can hold", () => {
    const big = new Uint8Array(900_000)
    for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString('base64'))
  })

  it('builds a data URL with the right type', () => {
    expect(imageDataUrl(bytes(1, 2, 3), 'image/png')).toBe('data:image/png;base64,AQID')
    expect(imageDataUrl(bytes(1, 2, 3), 'image/jpeg')).toBe('data:image/jpeg;base64,AQID')
  })

  it("reads a File's bytes (FileReader, so it also works where Blob.arrayBuffer does not)", async () => {
    const out = await readFileBytes(new File([new Uint8Array([9, 8, 7])], 'x.bin'))
    expect(Array.from(out)).toEqual([9, 8, 7])
  })
})

describe('formatFileSize', () => {
  it('KB below a megabyte (never "0 KB"), MB with one decimal above', () => {
    expect(formatFileSize(1)).toBe('1 KB')
    expect(formatFileSize(340 * 1024)).toBe('340 KB')
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1.3 MB')
  })
})

describe('the page cache', () => {
  it('remembers pages for a file id and forgets them', () => {
    rememberAttachmentPages('f-a', ['p1', 'p2'])
    expect(cachedAttachmentPages('f-a')).toEqual(['p1', 'p2'])
    forgetAttachmentPages('f-a')
    expect(cachedAttachmentPages('f-a')).toBeUndefined()
  })

  it('keeps only the three most recent files (each entry is megabytes of picture)', () => {
    for (const id of ['c1', 'c2', 'c3', 'c4']) rememberAttachmentPages(id, [id])
    expect(cachedAttachmentPages('c1')).toBeUndefined()
    expect(cachedAttachmentPages('c2')).toEqual(['c2'])
    expect(cachedAttachmentPages('c4')).toEqual(['c4'])
    // using an entry again makes it the newest
    rememberAttachmentPages('c2', ['c2b'])
    rememberAttachmentPages('c5', ['c5'])
    expect(cachedAttachmentPages('c2')).toEqual(['c2b'])
    expect(cachedAttachmentPages('c3')).toBeUndefined()
    for (const id of ['c2', 'c4', 'c5']) forgetAttachmentPages(id)
  })
})

// The page can only refuse what the server would refuse if the two agree (the playbook #30 / #58 pattern: parallel
// lists drift, so a test reads the other copy).
describe('agrees with the server', () => {
  const serverSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../../../services/gateway/src/lib/invoicePrintAttachment.ts'),
    'utf8',
  )

  it("the size limit is the server's", () => {
    expect(serverSrc).toMatch(/PRINT_ATTACHMENT_MAX_BYTES\s*=\s*10 \* 1024 \* 1024/)
    expect(PRINT_ATTACHMENT_MAX_BYTES).toBe(10 * 1024 * 1024)
  })

  it("the accepted types are the server's, exactly", () => {
    const m = /PRINT_ATTACHMENT_MIME_TYPES\s*=\s*\[([^\]]+)\]/.exec(serverSrc)
    expect(m).not.toBeNull()
    const server = (m?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter(Boolean)
    expect([...PRINT_ATTACHMENT_MIME_TYPES].sort()).toEqual([...server].sort())
  })

  it('ten sheets is the limit the page promises', () => {
    expect(PRINT_ATTACHMENT_MAX_PAGES).toBe(10)
  })
})
