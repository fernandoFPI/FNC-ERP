import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import path from 'path'
import { getB2Client, getBucket } from './client.js'
import { sanitizeFilename } from './validate.js'

export interface UploadUrlRequest {
  filename: string
  mimeType: string
  sizeBytes: number
  category: string
  companyId: string
  uploadedBy: string
}

export interface UploadUrlResponse {
  uploadUrl: string
  fileKey: string
  fileId: string
  expiresInSeconds: number
}

export async function generateUploadUrl(req: UploadUrlRequest): Promise<UploadUrlResponse> {
  const fileId = randomUUID()
  const ext = path.extname(req.filename).toLowerCase()
  const sanitized = sanitizeFilename(path.basename(req.filename, ext) + ext)

  const now = new Date()
  const fileKey = [
    req.companyId,
    req.category,
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    `${fileId}-${sanitized}`,
  ].join('/')

  const ttl = parseInt(process.env['PRESIGNED_URL_TTL_SECONDS'] ?? '900')

  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: fileKey,
    ContentType: req.mimeType,
    ContentLength: req.sizeBytes,
    Metadata: {
      'file-id': fileId,
      'company-id': req.companyId,
      'uploaded-by': req.uploadedBy,
      category: req.category,
      'original-name': sanitized,
    },
  })

  const uploadUrl = await getSignedUrl(getB2Client(), command, { expiresIn: ttl })

  return { uploadUrl, fileKey, fileId, expiresInSeconds: ttl }
}
