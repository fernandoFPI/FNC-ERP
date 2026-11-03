import { describe, it, expect } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import {
  uploadMimeType,
  UNKNOWN_MIME_TYPE,
  uploadErrorDetail,
  uploadFailureMessage,
  UPLOAD_LIMIT_MB,
} from '../uploadMimeType'

describe('uploadMimeType', () => {
  it('sends the type the browser reports', () => {
    expect(uploadMimeType({ type: 'application/pdf' })).toBe('application/pdf')
    expect(uploadMimeType({ type: 'application/x-compressed' })).toBe('application/x-compressed')
  })

  it("sends 'application/octet-stream' for a file whose type the PC does not know (type is '')", () => {
    // e.g. a .dwg or .rvt on a machine without the CAD software: file.type === ''.
    expect(uploadMimeType({ type: '' })).toBe(UNKNOWN_MIME_TYPE)
    expect(UNKNOWN_MIME_TYPE).toBe('application/octet-stream')
  })
})

// An axios error shaped like the ones the gateway and nginx really send.
function httpError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    config,
    {},
    {
      status,
      statusText: '',
      headers: {},
      config,
      data,
    },
  )
}

describe('uploadErrorDetail / uploadFailureMessage', () => {
  it("shows the server's own reason for a refused file", () => {
    const err = httpError(400, {
      success: false,
      error: {
        code: 'INVALID_FILE',
        message: 'File extension .rar does not match content type application/x-compressed',
      },
    })
    expect(uploadErrorDetail(err)).toBe(
      'File extension .rar does not match content type application/x-compressed',
    )
    expect(uploadFailureMessage('Upload failed', err)).toBe(
      'Upload failed: File extension .rar does not match content type application/x-compressed',
    )
  })

  it('names the size limit when nginx refuses a body that is too large (413, an HTML page)', () => {
    const err = httpError(413, '<html><body>413 Request Entity Too Large</body></html>')
    expect(uploadErrorDetail(err)).toBe(
      `The file is larger than the ${UPLOAD_LIMIT_MB} MB upload limit`,
    )
  })

  it('shows a blocked type the way the server words it', () => {
    const err = httpError(400, {
      success: false,
      error: { code: 'INVALID_FILE', message: 'File type .exe is not allowed' },
    })
    expect(uploadFailureMessage('Upload failed', err)).toBe(
      'Upload failed: File type .exe is not allowed',
    )
  })

  it('falls back to the plain message when there is nothing more specific', () => {
    expect(uploadErrorDetail(new Error('network down'))).toBeNull()
    expect(uploadErrorDetail(httpError(500, 'oops'))).toBeNull()
    expect(uploadErrorDetail(httpError(400, { error: { message: '   ' } }))).toBeNull()
    expect(uploadFailureMessage('Upload failed', new Error('x'))).toBe('Upload failed')
  })
})
