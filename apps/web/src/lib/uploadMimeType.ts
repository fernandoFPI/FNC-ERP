import axios from 'axios'

// What a file upload says about its own type.
//
// A browser reports `file.type` as '' for any type this PC has no program registered for (a .dwg or
// .rvt on a machine without the CAD software, a .step, a .ifc, ...). The gateway rejects an empty
// type, and an upload request with an empty Content-Type header is not read as a body at all, so
// such a file could not be uploaded. 'application/octet-stream' is the standard "unknown type";
// the server treats it as "nothing to check against the extension" rather than as a mismatch.
export const UNKNOWN_MIME_TYPE = 'application/octet-stream'

export function uploadMimeType(file: Pick<File, 'type'>): string {
  return file.type || UNKNOWN_MIME_TYPE
}

// The most a single upload can be: nginx's client_max_body_size and the gateway's upload proxy are
// both 50 MB, so a bigger file never reaches the application (nginx answers 413 with an HTML page).
export const UPLOAD_LIMIT_MB = 50

// Why an upload failed, in words the person can act on: the server's own message for a refusal
// (`File extension .rar does not match content type …`, `File type .exe is not allowed`), or the
// size limit for a 413. null when there is nothing more specific than "it failed".
export function uploadErrorDetail(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null
  if (err.response?.status === 413)
    return `The file is larger than the ${UPLOAD_LIMIT_MB} MB upload limit`
  const body = err.response?.data as { error?: { message?: unknown } } | undefined
  const message = body?.error?.message
  return typeof message === 'string' && message.trim() !== '' ? message.trim() : null
}

// "Upload failed" on its own hides the cause; with the cause it says what to change.
export function uploadFailureMessage(base: string, err: unknown): string {
  const detail = uploadErrorDetail(err)
  return detail ? `${base}: ${detail}` : base
}
