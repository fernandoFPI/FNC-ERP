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
