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
