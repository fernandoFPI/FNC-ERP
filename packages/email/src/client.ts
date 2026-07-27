import { ConfidentialClientApplication } from '@azure/msal-node'
import { logger } from '@fnc-erp/logger'

const log = logger.child({ module: 'email' })

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'

export interface EmailConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  senderAddress: string
  fromName?: string
  fromAddress?: string
  replyTo?: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number
  key: string
}

let _cachedToken: CachedToken | null = null

function configKey(config: EmailConfig): string {
  return `${config.tenantId}:${config.clientId}:${config.senderAddress}`
}

function buildMsalClient(config: EmailConfig): ConfidentialClientApplication {
  return new ConfidentialClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      clientSecret: config.clientSecret,
    },
  })
}

// Acquires an app-only Graph API access token via client-credentials flow,
// caching it in memory until shortly before it expires (tokens are typically
// valid ~60-90 minutes). Re-acquires immediately if the config (tenant/client/
// sender) changes, e.g. after an admin updates system_config.
export async function getGraphAccessToken(config: EmailConfig): Promise<string> {
  const key = configKey(config)
  const now = Date.now()
  if (_cachedToken && _cachedToken.key === key && _cachedToken.expiresAt > now) {
    return _cachedToken.accessToken
  }

  const msalClient = buildMsalClient(config)
  const result = await msalClient.acquireTokenByClientCredential({ scopes: [GRAPH_SCOPE] })
  if (!result?.accessToken) {
    throw new Error('Failed to acquire Microsoft Graph access token — check tenant/client/secret')
  }

  // Refresh 5 minutes early to avoid racing against expiry mid-request.
  const expiresAt = result.expiresOn ? result.expiresOn.getTime() - 5 * 60_000 : now + 55 * 60_000
  _cachedToken = { accessToken: result.accessToken, expiresAt, key }
  log.info({ senderAddress: config.senderAddress }, 'Microsoft Graph access token acquired')
  return result.accessToken
}

export function invalidateTokenCache(): void {
  _cachedToken = null
}
