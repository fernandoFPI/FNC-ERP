import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '@fnc-erp/config'
import { logger } from '@fnc-erp/logger'

const log = logger.child({ module: 'email' })

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  fromName?: string
  fromAddress?: string
  replyTo?: string
}

let _cachedTransporter: Transporter | null = null

export function getTransporter(): Transporter {
  if (_cachedTransporter) return _cachedTransporter

  _cachedTransporter = nodemailer.createTransport({
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

  _cachedTransporter.verify((err) => {
    if (err) {
      log.error({ err }, 'SMTP connection verification failed')
    } else {
      log.info('SMTP connection verified successfully')
    }
  })

  return _cachedTransporter
}

export function createTransporterFromConfig(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
    socketTimeout: 30_000,
  })
}

export function invalidateTransporterCache(): void {
  _cachedTransporter = null
}
