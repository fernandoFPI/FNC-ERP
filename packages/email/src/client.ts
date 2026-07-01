import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '@fnc-erp/config'
import { logger } from '@fnc-erp/logger'

const log = logger.child({ module: 'email' })

let transporter: Transporter | null = null

export function getTransporter(): Transporter {
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
    socketTimeout: 30_000,
  })

  transporter.verify((err) => {
    if (err) {
      log.error({ err }, 'SMTP connection verification failed')
    } else {
      log.info('SMTP connection verified successfully')
    }
  })

  return transporter
}
