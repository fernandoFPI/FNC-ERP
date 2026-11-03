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
  po_receipt_photo: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
  ],
  po_receipt_document: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
  ],
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

// Every type name a browser, Windows or an archive tool is known to report for a ZIP, RAR or 7-Zip
// file. They are one family on purpose: which name a PC reports depends on which program registered
// the extension (WinRAR and 7-Zip say 'application/x-compressed' for all three; Windows says
// 'application/x-zip-compressed'; Firefox and some tools say 'application/x-rar'), and people rename
// one archive format to another, so a .zip that is really a RAR must not be turned away.
const ARCHIVE_MIME_TYPES = [
  'application/zip',
  'application/x-zip',
  'application/x-zip-compressed',
  'application/zip-compressed',
  'multipart/x-zip',
  'application/x-compressed',
  'application/x-compress',
  'application/vnd.rar',
  'application/x-rar',
  'application/x-rar-compressed',
  'application/rar',
  'application/x-7z-compressed',
  'application/x-7z',
  'application/7z',
  'application/gzip',
  'application/x-gzip',
  'application/x-tar',
  'application/x-gtar',
  'application/x-bzip2',
  'application/x-xz',
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
  '.zip': ARCHIVE_MIME_TYPES,
  '.rar': ARCHIVE_MIME_TYPES,
  '.7z': ARCHIVE_MIME_TYPES,
}

// What a browser or client sends when it does not know a file's type.
const UNKNOWN_CONTENT_TYPES = ['', 'application/octet-stream']

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
  // through rather than being rejected as "unrecognized". The same goes
  // for a type the browser could not determine (application/octet-stream,
  // which is what the web app sends for a file whose type the PC does not
  // know): "unknown" claims to be nothing, so it cannot be a spoof of
  // another type, and refusing it would turn away real files.
  const mimeAllowedForExt = EXTENSION_MIME_MAP[ext]
  if (
    mimeAllowedForExt &&
    !UNKNOWN_CONTENT_TYPES.includes(mimeType) &&
    !mimeAllowedForExt.includes(mimeType)
  ) {
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
