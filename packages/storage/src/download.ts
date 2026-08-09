import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getB2Client, getBucket } from './client.js'

function isDevMode(): boolean {
  return process.env['B2_KEY_ID'] === 'dev-placeholder' || !process.env['B2_KEY_ID']
}

export interface DownloadUrlResponse {
  downloadUrl: string
  expiresInSeconds: number
  filename: string
}

export async function generateDownloadUrl(
  fileKey: string,
  originalFilename: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): Promise<DownloadUrlResponse> {
  if (isDevMode()) {
    const gatewayUrl = process.env['GATEWAY_PUBLIC_URL'] ?? 'http://localhost:3000'
    const suffix = disposition === 'inline' ? '?disposition=inline' : ''
    return {
      downloadUrl: `${gatewayUrl}/api/v1/files/dev-uploads/${fileKey}${suffix}`,
      expiresInSeconds: 86400,
      filename: originalFilename,
    }
  }

  const ttl = parseInt(process.env['PRESIGNED_URL_TTL_SECONDS'] ?? '900')

  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: fileKey,
    ResponseContentDisposition: `${disposition}; filename="${originalFilename}"`,
  })

  const downloadUrl = await getSignedUrl(getB2Client(), command, { expiresIn: ttl })

  return { downloadUrl, expiresInSeconds: ttl, filename: originalFilename }
}
