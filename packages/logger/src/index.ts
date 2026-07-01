import pino from 'pino'

function buildLogger(): pino.Logger {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development'
  const logLevel = process.env['LOG_LEVEL'] ?? 'info'
  const serviceName = process.env['SERVICE_NAME'] ?? 'unknown'
  const isDev = nodeEnv === 'development' || nodeEnv === 'test'

  const baseOptions: pino.LoggerOptions = {
    level: logLevel,
    base: { service: serviceName, env: nodeEnv },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.body.password',
        'req.body.password_hash',
        'req.body.mfa_secret',
        'req.body.token',
        'req.body.refresh_token',
        'req.body.account_number',
        'req.body.iban',
        '*.password',
        '*.password_hash',
        '*.mfa_secret',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
  }

  if (isDev) {
    return pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
    })
  }

  return pino(baseOptions)
}

export const logger = buildLogger()

export function createServiceLogger(serviceName: string): pino.Logger {
  return logger.child({ service: serviceName })
}

export function createRequestLogger(
  requestId: string,
  userId?: string,
  companyId?: string,
): pino.Logger {
  return logger.child({ requestId, userId, companyId })
}

export type { Logger } from 'pino'
export { requestLogger } from './request-logger.js'
