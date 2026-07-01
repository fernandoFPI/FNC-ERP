import { getTransporter } from './client.js'
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

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!env.SMTP_HOST) {
    log.info(
      { to: message.to, subject: message.subject },
      '[email-stub] SMTP_HOST not configured — skipping send',
    )
    return
  }

  const transporter = getTransporter()

  try {
    const info = await transporter.sendMail({
      from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`,
      replyTo: message.replyTo ?? env.EMAIL_REPLY_TO,
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
