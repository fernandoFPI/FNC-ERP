import { RateLimiterRedis } from 'rate-limiter-flexible'
import { createClient } from 'redis'
import type { Request, Response, NextFunction } from 'express'
import { env } from '@fnc-erp/config'
import { logger } from '@fnc-erp/logger'

const redisClient = createClient({
  url: env.REDIS_URL,
  RESP: 2,  // RESP2 — compatible with Redis 5.x (no HELLO 3 handshake)
})
redisClient.on('error', (err: unknown) => {
  logger.error({ err }, 'Redis client error in rate limiter')
})
void redisClient.connect()

// ── Global per-IP limiter ──────────────────────────────────────
const globalLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl:global',
  points: env.RATE_LIMIT_MAX_GLOBAL,
  duration: 60,
  blockDuration: 60,
})

// ── Auth endpoint limiter ──────────────────────────────────────
const authLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl:auth',
  points: env.RATE_LIMIT_MAX_AUTH,
  duration: 60,
  blockDuration: 300,
})

// ── Per-user limiter ───────────────────────────────────────────
const userLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl:user',
  points: env.RATE_LIMIT_MAX_PER_USER,
  duration: 60,
  blockDuration: 30,
})

interface RateLimiterError {
  msBeforeNext: number
}

function isRateLimiterError(err: unknown): err is RateLimiterError {
  return typeof err === 'object' && err !== null && 'msBeforeNext' in err
}

export function globalRateLimit() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await globalLimiter.consume(req.ip ?? 'unknown')
      next()
    } catch (err) {
      if (isRateLimiterError(err)) {
        logger.warn(
          { ip: req.ip, url: req.url, retryAfter: err.msBeforeNext },
          'global rate limit exceeded',
        )
        const retryAfter = Math.ceil(err.msBeforeNext / 1000)
        res.setHeader('Retry-After', retryAfter)
        res.setHeader('X-RateLimit-Limit', env.RATE_LIMIT_MAX_GLOBAL)
        res.setHeader('X-RateLimit-Remaining', 0)
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            retryAfterSeconds: retryAfter,
          },
        })
        return
      }
      next()
    }
  }
}

export function authRateLimit() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as Record<string, unknown>
    const email = typeof body['email'] === 'string' ? body['email'] : 'unknown'
    const key = `${req.ip ?? 'unknown'}:${email}`
    try {
      await authLimiter.consume(key)
      next()
    } catch (err) {
      if (isRateLimiterError(err)) {
        logger.warn(
          { ip: req.ip, email, url: req.url, retryAfter: err.msBeforeNext },
          'auth rate limit exceeded',
        )
        const retryAfter = Math.ceil(err.msBeforeNext / 1000)
        res.setHeader('Retry-After', retryAfter)
        res.status(429).json({
          success: false,
          error: {
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            message: 'Too many attempts. Please wait before trying again.',
            retryAfterSeconds: retryAfter,
          },
        })
        return
      }
      next()
    }
  }
}

export function userRateLimit() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.auth?.userId
    if (!userId) {
      next()
      return
    }
    try {
      await userLimiter.consume(userId)
      next()
    } catch (err) {
      if (isRateLimiterError(err)) {
        logger.warn(
          { userId, url: req.url, retryAfter: err.msBeforeNext },
          'user rate limit exceeded',
        )
        const retryAfter = Math.ceil(err.msBeforeNext / 1000)
        res.setHeader('Retry-After', retryAfter)
        res.status(429).json({
          success: false,
          error: {
            code: 'USER_RATE_LIMIT_EXCEEDED',
            message: 'Request rate exceeded. Please slow down.',
            retryAfterSeconds: retryAfter,
          },
        })
        return
      }
      next()
    }
  }
}
