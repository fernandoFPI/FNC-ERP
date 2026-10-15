import { S3Client } from '@aws-sdk/client-s3'
import { getSystemConfig } from '@fnc-erp/db'

// Reads from system_config (Settings > Integrations), falling back to the
// B2_* env vars via getSystemConfig's own ENV_FALLBACKS — same pattern as
// every other integration (msgraph, email, fx). No caching: a saved Settings
// change must take effect on the next request, not just after a restart.
export async function getB2Client(): Promise<S3Client> {
  const [endpointRaw, region, accessKeyId, secretAccessKey] = await Promise.all([
    getSystemConfig('storage.b2_endpoint'),
    getSystemConfig('storage.b2_region'),
    getSystemConfig('storage.b2_key_id'),
    getSystemConfig('storage.b2_application_key'),
  ])

  // The Settings > Integrations field is free text; a value saved without a
  // scheme (e.g. copy-pasted hostname only) would otherwise fail silently —
  // the S3 SDK needs a full URL, not a bare host.
  const endpoint =
    endpointRaw && !/^https?:\/\//i.test(endpointRaw)
      ? `https://${endpointRaw}`
      : (endpointRaw ?? '')

  return new S3Client({
    endpoint,
    region: region ?? 'us-west-004',
    credentials: {
      accessKeyId: accessKeyId ?? '',
      secretAccessKey: secretAccessKey ?? '',
    },
    forcePathStyle: true,
  })
}

export async function getBucket(): Promise<string> {
  return (await getSystemConfig('storage.b2_bucket_name')) ?? ''
}
