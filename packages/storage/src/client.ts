import { S3Client } from '@aws-sdk/client-s3'

// Lazy initialisation — avoids env parse at import time in tests
let _client: S3Client | null = null
let _bucket: string | null = null

export function getB2Client(): S3Client {
  if (!_client) {
    const endpoint = process.env['B2_ENDPOINT'] ?? ''
    const region = process.env['B2_REGION'] ?? 'us-west-004'
    const accessKeyId = process.env['B2_KEY_ID'] ?? ''
    const secretAccessKey = process.env['B2_APPLICATION_KEY'] ?? ''

    _client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    })
  }
  return _client
}

export function getBucket(): string {
  if (!_bucket) {
    _bucket = process.env['B2_BUCKET_NAME'] ?? ''
  }
  return _bucket
}
