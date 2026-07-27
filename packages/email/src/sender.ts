import { getGraphAccessToken, type EmailConfig } from './client.js'
import { env } from '@fnc-erp/config'
import { logger } from '@fnc-erp/logger'

const log = logger.child({ module: 'email-sender' })

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

export interface EmailMessage {
  to: string | string[]
  subject: string
  html: string
  attachments?: {
    filename: string
    content: Buffer
    contentType: string
  }[]
  replyTo?: string
}

function addressList(to: string | string[]): string[] {
  const raw = Array.isArray(to) ? to : to.split(',')
  return raw.map((a) => a.trim()).filter(Boolean)
}

function toEmailAddress(address: string) {
  return { emailAddress: { address } }
}

function defaultConfigFromEnv(): EmailConfig | null {
  if (!env.MSGRAPH_TENANT_ID || !env.MSGRAPH_CLIENT_ID || !env.MSGRAPH_CLIENT_SECRET || !env.MSGRAPH_SENDER_ADDRESS) {
    return null
  }
  const config: EmailConfig = {
    tenantId: env.MSGRAPH_TENANT_ID,
    clientId: env.MSGRAPH_CLIENT_ID,
    clientSecret: env.MSGRAPH_CLIENT_SECRET,
    senderAddress: env.MSGRAPH_SENDER_ADDRESS,
    fromName: env.EMAIL_FROM_NAME,
  }
  if (env.EMAIL_FROM_ADDRESS) config.fromAddress = env.EMAIL_FROM_ADDRESS
  if (env.EMAIL_REPLY_TO) config.replyTo = env.EMAIL_REPLY_TO
  return config
}

export async function sendEmail(
  message: EmailMessage,
  emailConfig?: EmailConfig | null,
): Promise<void> {
  const config = emailConfig ?? defaultConfigFromEnv()
  if (!config) {
    log.info(
      { to: message.to, subject: message.subject },
      '[email-stub] Microsoft Graph not configured — skipping send',
    )
    return
  }

  try {
    const accessToken = await getGraphAccessToken(config)

    const fromName = config.fromName ?? 'FNC ERP'
    const fromAddress = config.fromAddress ?? config.senderAddress
    const replyTo = message.replyTo ?? config.replyTo

    const graphMessage: Record<string, unknown> = {
      subject: message.subject,
      body: { contentType: 'HTML', content: message.html },
      toRecipients: addressList(message.to).map(toEmailAddress),
      from: { emailAddress: { address: fromAddress, name: fromName } },
    }
    if (replyTo) graphMessage['replyTo'] = [toEmailAddress(replyTo)]
    if (message.attachments?.length) {
      graphMessage['attachments'] = message.attachments.map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename,
        contentType: a.contentType,
        contentBytes: a.content.toString('base64'),
      }))
    }

    const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(config.senderAddress)}/sendMail`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: graphMessage, saveToSentItems: false }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Graph sendMail failed: ${String(res.status)} ${res.statusText} — ${body}`)
    }

    log.info({ to: message.to, subject: message.subject }, 'email sent successfully')
  } catch (err) {
    log.error({ err, to: message.to, subject: message.subject }, 'email send failed')
    throw err
  }
}
