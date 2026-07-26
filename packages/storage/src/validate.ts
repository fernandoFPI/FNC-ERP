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
  po_return_damage_photo: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
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

  const allowed = ALLOWED_TYPES[category] ?? []
  if (!allowed.includes(mimeType)) {
    return {
      valid: false,
      reason: `File type ${mimeType} is not allowed for ${category} documents. Allowed: ${allowed.join(', ')}`,
    }
  }

  const mimeAllowedForExt = EXTENSION_MIME_MAP[ext]
  if (!mimeAllowedForExt?.includes(mimeType)) {
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
