import { getTransporter, createTransporterFromConfig, type SmtpConfig } from './client.js'
import { env } from '@fnc-erp/config'
import { logger } from '@fnc-erp/logger'

const log = logger.child({ module: 'email-sender' })

export interface EmailMessage {
  to: string | string[]
  subject: string
  html: string
  text?: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
  replyTo?: string
}

export async function sendEmail(message: EmailMessage, smtpConfig?: SmtpConfig | null): Promise<void> {
  const host = smtpConfig?.host ?? env.SMTP_HOST
  if (!host) {
    log.info(
      { to: message.to, subject: message.subject },
      '[email-stub] SMTP_HOST not configured — skipping send',
    )
    return
  }

  const transporter = smtpConfig
    ? createTransporterFromConfig(smtpConfig)
    : getTransporter()

  const fromName = smtpConfig?.fromName ?? env.EMAIL_FROM_NAME
  const fromAddress = smtpConfig?.fromAddress ?? env.EMAIL_FROM_ADDRESS
  const replyTo = message.replyTo ?? smtpConfig?.replyTo ?? env.EMAIL_REPLY_TO

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      replyTo: replyTo || undefined,
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      subject: message.subject,
      html: message.html,
      text: message.text ?? stripHtml(message.html),
      attachments: message.attachments,
    })

    log.info(
      { messageId: info.messageId, to: message.to, subject: message.subject },
      'email sent successfully',
    )
  } catch (err) {
    log.error({ err, to: message.to, subject: message.subject }, 'email send failed')
    throw err
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
