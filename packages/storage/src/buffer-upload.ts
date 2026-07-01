import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getB2Client, getBucket } from './client.js'
import { logger } from '@fnc-erp/logger'
import fs from 'fs'
import path from 'path'

function isDevMode(): boolean {
  return process.env['B2_KEY_ID'] === 'dev-placeholder' || !process.env['B2_KEY_ID']
}

export function devUploadsDir(): string {
  return path.resolve(process.cwd(), 'dev-uploads')
}

export async function uploadBuffer(
  buffer: Buffer,
  fileKey: string,
  contentType: string,
): Promise<void> {
  if (isDevMode()) {
    const dest = path.join(devUploadsDir(), fileKey)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, buffer)
    logger.info({ fileKey, bytes: buffer.length }, 'dev-mode: buffer saved to local disk')
    return
  }

  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: fileKey,
    Body: buffer,
    ContentType: contentType,
    ContentLength: buffer.length,
  })

  try {
    await getB2Client().send(command)
    logger.info({ fileKey, bytes: buffer.length }, 'buffer uploaded to B2')
  } catch (err) {
    logger.error({ err, fileKey }, 'failed to upload buffer to B2')
    throw err
  }
}
