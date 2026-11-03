import { describe, it, expect } from 'vitest'
import { validateFile, sanitizeFilename } from '../src/validate.js'

const MAX_50MB = 50 * 1024 * 1024

describe('File validation', () => {
  it('accepts valid PDF under size limit', () => {
    const result = validateFile('contract.pdf', 'application/pdf', 1024, 'attachment', MAX_50MB)
    expect(result.valid).toBe(true)
  })

  it('accepts valid JPEG image for attachment category', () => {
    const result = validateFile('photo.jpg', 'image/jpeg', 1024, 'attachment', MAX_50MB)
    expect(result.valid).toBe(true)
  })

  it('rejects file exceeding max size', () => {
    const result = validateFile('big.pdf', 'application/pdf', MAX_50MB + 1, 'attachment', MAX_50MB)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/exceeds maximum/)
  })

  it('rejects .exe file regardless of MIME type', () => {
    const result = validateFile('malware.exe', 'application/pdf', 1024, 'attachment', MAX_50MB)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/\.exe/)
  })

  it('rejects MIME type not in category allowlist', () => {
    const result = validateFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024, 'contract', MAX_50MB)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/not allowed/)
  })

  it('rejects mismatched extension and MIME type — .pdf with image/jpeg', () => {
    const result = validateFile('fake.pdf', 'image/jpeg', 1024, 'attachment', MAX_50MB)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/does not match/)
  })

  it.each(['bid.zip', 'bid.rar', 'bid.7z'])(
    'accepts %s sent as application/x-compressed (what Windows browsers report with WinRAR / 7-Zip installed)',
    (filename) => {
      const result = validateFile(filename, 'application/x-compressed', 1024, 'attachment', MAX_50MB)
      expect(result.valid).toBe(true)
    },
  )

  it.each([
    ['bid.zip', 'application/zip'],
    ['bid.rar', 'application/vnd.rar'],
    ['bid.rar', 'application/x-rar-compressed'],
    ['bid.7z', 'application/x-7z-compressed'],
  ])('still accepts %s sent as its own type %s', (filename, mimeType) => {
    expect(validateFile(filename, mimeType, 1024, 'attachment', MAX_50MB).valid).toBe(true)
  })

  it('still rejects an archive type on a non-archive extension — .pdf with application/x-compressed', () => {
    const result = validateFile('fake.pdf', 'application/x-compressed', 1024, 'attachment', MAX_50MB)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/does not match/)
  })

  it('still rejects an archive extension sent as a different known type — .rar with image/jpeg', () => {
    const result = validateFile('bid.rar', 'image/jpeg', 1024, 'attachment', MAX_50MB)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/does not match/)
  })

  it('archive type does not open other categories — contract still refuses application/x-compressed', () => {
    const result = validateFile('bid.zip', 'application/x-compressed', 1024, 'contract', MAX_50MB)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/not allowed/)
  })

  // Every name a PC may report for an archive is accepted on every archive extension: which name it is
  // depends on which program registered the extension, and people rename one format to another.
  it.each([
    'application/zip',
    'application/x-zip',
    'application/x-zip-compressed',
    'application/zip-compressed',
    'multipart/x-zip',
    'application/x-compressed',
    'application/vnd.rar',
    'application/x-rar',
    'application/x-rar-compressed',
    'application/rar',
    'application/x-7z-compressed',
    'application/x-7z',
    'application/gzip',
    'application/x-tar',
  ])('accepts an archive sent as %s on .zip, .rar and .7z', (mimeType) => {
    for (const filename of ['bid.zip', 'bid.rar', 'bid.7z', 'BID PACKAGE.ZIP']) {
      expect(validateFile(filename, mimeType, 1024, 'attachment', MAX_50MB).valid, filename).toBe(true)
    }
  })

  it.each(['image/jpeg', 'application/pdf', 'text/html', 'application/x-msdownload', 'text/plain'])(
    'still refuses an archive extension that claims to be %s',
    (mimeType) => {
      for (const filename of ['bid.zip', 'bid.rar', 'bid.7z']) {
        const r = validateFile(filename, mimeType, 1024, 'attachment', MAX_50MB)
        expect(r.valid, `${filename} as ${mimeType}`).toBe(false)
        expect(r.reason).toMatch(/does not match/)
      }
    },
  )

  it('the refusal names the extension and the type, so the cause can be read off the screen', () => {
    const r = validateFile('bid.zip', 'image/jpeg', 1024, 'attachment', MAX_50MB)
    expect(r.reason).toBe('File extension .zip does not match content type image/jpeg')
  })

  // A browser sends no type, or "unknown", for a file whose type the PC has no program for. That
  // claims to be nothing, so it cannot be a spoof of another type and must not be turned away.
  it.each([
    ['plan.pdf', 'application/octet-stream'],
    ['plan.pdf', ''],
    ['boq.xlsx', 'application/octet-stream'],
    ['letter.docx', 'application/octet-stream'],
    ['photo.png', 'application/octet-stream'],
    ['bid.zip', 'application/octet-stream'],
    ['bid.rar', ''],
    ['model.dwg', 'application/octet-stream'],
    ['model.rvt', ''],
  ])('accepts %s whose type the browser could not determine (%j)', (filename, mimeType) => {
    expect(validateFile(filename, mimeType, 1024, 'attachment', MAX_50MB).valid).toBe(true)
  })

  it('an unknown type does not get a blocked extension through', () => {
    for (const filename of ['setup.exe', 'run.bat', 'x.js', 'page.html', 'image.svg']) {
      const r = validateFile(filename, 'application/octet-stream', 1024, 'attachment', MAX_50MB)
      expect(r.valid, filename).toBe(false)
      expect(r.reason, filename).toMatch(/not allowed/)
    }
  })

  it('a known but different type is still a mismatch — the spoof check keeps working', () => {
    const r = validateFile('plan.pdf', 'image/jpeg', 1024, 'attachment', MAX_50MB)
    expect(r.valid).toBe(false)
    expect(r.reason).toMatch(/does not match/)
  })

  it('an unknown type does not open the categories that have a fixed allowlist', () => {
    const r = validateFile('plan.pdf', 'application/octet-stream', 1024, 'contract', MAX_50MB)
    expect(r.valid).toBe(false)
    expect(r.reason).toMatch(/not allowed/)
  })

  it('accepts AutoCAD files for attachment category (not in the fixed allowlist)', () => {
    const dwg = validateFile('drawing.dwg', 'application/acad', 1024, 'attachment', MAX_50MB)
    expect(dwg.valid).toBe(true)
    const dxf = validateFile('drawing.dxf', 'image/vnd.dxf', 1024, 'attachment', MAX_50MB)
    expect(dxf.valid).toBe(true)
  })

  it('accepts email files for attachment category (not in the fixed allowlist)', () => {
    const eml = validateFile('message.eml', 'message/rfc822', 1024, 'attachment', MAX_50MB)
    expect(eml.valid).toBe(true)
    const msg = validateFile('message.msg', 'application/vnd.ms-outlook', 1024, 'attachment', MAX_50MB)
    expect(msg.valid).toBe(true)
  })

  it('blocks renderable markup (.html/.svg) even for the blocklist-only attachment category — preview now serves inline, so these must never be uploadable', () => {
    const html = validateFile('page.html', 'text/html', 1024, 'attachment', MAX_50MB)
    expect(html.valid).toBe(false)
    const svg = validateFile('image.svg', 'image/svg+xml', 1024, 'attachment', MAX_50MB)
    expect(svg.valid).toBe(false)
  })

  it('still blocks dangerous extensions for attachment category even though it is blocklist-only', () => {
    const result = validateFile('payload.exe', 'application/acad', 1024, 'attachment', MAX_50MB)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/\.exe/)
  })

  it('identity category is unaffected by the attachment-category loosening — still rejects AutoCAD', () => {
    const result = validateFile('drawing.dwg', 'application/acad', 1024, 'identity', MAX_50MB)
    expect(result.valid).toBe(false)
  })

  it('identity category only allows PDF and images — rejects xlsx', () => {
    const result = validateFile(
      'data.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      1024,
      'identity',
      MAX_50MB,
    )
    expect(result.valid).toBe(false)
  })

  it('contract category does not allow images — rejects JPEG', () => {
    const result = validateFile('photo.jpg', 'image/jpeg', 1024, 'contract', MAX_50MB)
    expect(result.valid).toBe(false)
  })

  it('accepts docx for contract category', () => {
    const result = validateFile(
      'agreement.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      1024,
      'contract',
      MAX_50MB,
    )
    expect(result.valid).toBe(true)
  })

  it('report category only allows PDF', () => {
    const valid = validateFile('report.pdf', 'application/pdf', 1024, 'report', MAX_50MB)
    expect(valid.valid).toBe(true)

    const invalid = validateFile('report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024, 'report', MAX_50MB)
    expect(invalid.valid).toBe(false)
  })
})

describe('sanitizeFilename', () => {
  it('removes special characters', () => {
    // space→-, (→-, )→-, !→- then consecutive dashes collapse to single -
    expect(sanitizeFilename('my file (v2)!.pdf')).toBe('my-file-v2-.pdf')
  })

  it('collapses multiple dashes', () => {
    expect(sanitizeFilename('file---name.pdf')).toBe('file-name.pdf')
  })

  it('converts to lowercase', () => {
    expect(sanitizeFilename('CONTRACT.PDF')).toBe('contract.pdf')
  })

  it('truncates to 100 chars', () => {
    const long = 'a'.repeat(200) + '.pdf'
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(100)
  })

  it('preserves dots and hyphens', () => {
    expect(sanitizeFilename('my-doc.v2.pdf')).toBe('my-doc.v2.pdf')
  })
})
