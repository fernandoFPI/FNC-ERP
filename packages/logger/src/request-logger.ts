import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { logger } from './index.js'
import type pino from 'pino'

// Augment Express Request to carry requestId and per-request logger
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string
      logger: pino.Logger
    }
  }
}

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = randomUUID()
    const startTime = Date.now()

    req.requestId = requestId
    // Attach scoped logger — auth may not be set yet, so defer field access
    req.logger = logger.child({ requestId })

    logger.info(
      {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      'incoming request',
    )

    res.on('finish', () => {
      const duration = Date.now() - startTime
      const statusCode = res.statusCode
      const level: pino.Level =
        statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'

      // Access auth lazily — it's set by middleware after this function runs
      const auth = (req as Request & { auth?: { userId?: string; companyId?: string } }).auth

      logger[level](
        {
          requestId,
          method: req.method,
          url: req.url,
          statusCode,
          duration,
          userId: auth?.userId,
          companyId: auth?.companyId,
        },
        'request completed',
      )
    })

    next()
  }
}
