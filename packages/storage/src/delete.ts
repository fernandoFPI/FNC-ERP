import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getB2Client, getBucket } from './client.js'
import { logger } from '@fnc-erp/logger'

export async function deleteFile(fileKey: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({ Bucket: getBucket(), Key: fileKey })
    await getB2Client().send(command)
    logger.info({ fileKey }, 'file deleted from B2')
  } catch (err) {
    logger.error({ err, fileKey }, 'failed to delete file from B2')
    throw err
  }
}
