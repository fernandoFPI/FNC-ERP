import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getB2Client, getBucket } from './client.js'
import { devUploadsDir } from './buffer-upload.js'
import fs from 'fs'
import path from 'path'

function isDevMode(): boolean {
  return process.env['B2_KEY_ID'] === 'dev-placeholder' || !process.env['B2_KEY_ID']
}

// Server-side read of a stored file's bytes. Used to proxy content back through
// the gateway (same-origin) instead of the browser fetching B2 directly, which
// avoids CORS restrictions — the same reason uploads are proxied via uploadBuffer.
export async function downloadBuffer(fileKey: string): Promise<Buffer> {
  if (isDevMode()) {
    return fs.readFileSync(path.join(devUploadsDir(), fileKey))
  }

  const command = new GetObjectCommand({ Bucket: getBucket(), Key: fileKey })
  const response = await getB2Client().send(command)
  if (!response.Body) throw new Error(`No body returned for file key: ${fileKey}`)
  const bytes = await response.Body.transformToByteArray()
  return Buffer.from(bytes)
}
