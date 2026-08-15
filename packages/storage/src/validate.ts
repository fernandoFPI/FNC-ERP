import path from 'path'

export const ALLOWED_TYPES: Record<string, string[]> = {
  contract: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  identity: ['application/pdf', 'image/jpeg', 'image/png'],
  attachment: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'application/vnd.rar',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
  ],
  report: ['application/pdf'],
  po_receipt_photo: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  po_receipt_document: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  po_return_damage_photo: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  recharge_proof: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
}

const BLOCKED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.js',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.vbs',
  '.jar',
  '.com',
  '.scr',
  // Renderable-markup types — blocked because 'attachment'-category uploads
  // can now be previewed with Content-Disposition: inline (see download.ts).
  // An uploaded .html/.svg previewed inline would execute embedded script
  // in the storage bucket's origin — not this app's own origin, but still
  // a real phishing/redress vector via a "trusted" document preview.
  '.html',
  '.htm',
  '.xhtml',
  '.shtml',
  '.svg',
]

const EXTENSION_MIME_MAP: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.heic': ['image/heic'],
  '.heif': ['image/heif'],
  '.zip': ['application/zip', 'application/x-zip-compressed', 'application/x-zip'],
  '.rar': ['application/vnd.rar', 'application/x-rar-compressed'],
  '.7z': ['application/x-7z-compressed'],
}

export interface ValidationResult {
  valid: boolean
  reason?: string
}

// 'attachment' covers general project/client document exchange (emails,
// CAD drawings, and anything else a client or vendor might send) — too
// open-ended for a fixed mime allowlist, so it's blocklist-only: reject
// known-dangerous extensions, allow everything else. Other categories
// (contract, identity, receipt photos, ...) keep their tighter allowlist.
const BLOCKLIST_ONLY_CATEGORIES = ['attachment']

export function validateFile(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  category: string,
  maxSizeBytes: number,
): ValidationResult {
  if (sizeBytes > maxSizeBytes) {
    const maxMB = Math.round(maxSizeBytes / 1024 / 1024)
    const fileMB = Math.round(sizeBytes / 1024 / 1024)
    return { valid: false, reason: `File size ${fileMB}MB exceeds maximum ${maxMB}MB` }
  }

  const ext = path.extname(filename).toLowerCase()

  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { valid: false, reason: `File type ${ext} is not allowed` }
  }

  if (!BLOCKLIST_ONLY_CATEGORIES.includes(category)) {
    const allowed = ALLOWED_TYPES[category] ?? []
    if (!allowed.includes(mimeType)) {
      return {
        valid: false,
        reason: `File type ${mimeType} is not allowed for ${category} documents. Allowed: ${allowed.join(', ')}`,
      }
    }
  }

  // Cross-check extension vs. declared content-type wherever we have a
  // known mapping — a spoofing defense (e.g. "fake.pdf" sent as
  // image/jpeg), independent of the category allowlist above and enforced
  // even for blocklist-only categories. Extensions with no entry here
  // (.dwg, .eml, .msg, ...) have nothing to cross-check, so they pass
  // through rather than being rejected as "unrecognized".
  const mimeAllowedForExt = EXTENSION_MIME_MAP[ext]
  if (mimeAllowedForExt && !mimeAllowedForExt.includes(mimeType)) {
    return {
      valid: false,
      reason: `File extension ${ext} does not match content type ${mimeType}`,
    }
  }

  return { valid: true }
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(0, 100)
}
