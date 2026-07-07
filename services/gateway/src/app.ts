import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import proxy from 'express-http-proxy'
import path from 'path'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@apollo/server/express4'
import { env } from '@fnc-erp/config'
import { requireAuth } from '@fnc-erp/auth'
import { buildHealthStatus } from '@fnc-erp/db'
import { requestLogger } from '@fnc-erp/logger'
import { devUploadsDir } from '@fnc-erp/storage'
import { globalRateLimit, authRateLimit, userRateLimit } from './middleware/rate-limit.js'
import { versionHeader } from './middleware/version.js'
import { entityContextMiddleware } from './middleware/entityContext.js'
import { typeDefs } from './graphql/schema.js'
import { resolvers } from './graphql/resolvers.js'
import { filesRouter } from './routes/files.js'
import { adminOutboxRouter } from './routes/admin-outbox.js'
import { mobileSyncRouter } from './routes/mobile-sync.js'
import { inventoryImportRouter } from './routes/inventory-import.js'
import { workflowImportRouter } from './routes/workflow-import.js'
import { userProfileRouter } from './routes/user-profile.js'
import { verifyRouter } from './routes/verify.js'
import { systemConfigRouter } from './routes/system-config.js'
import { documentSequencesRouter } from './routes/document-sequences.js'
import { notificationRoutingRouter } from './routes/notification-routing.js'
import { searchRouter } from './routes/search.js'
import { jobRunsRouter } from './routes/job-runs.js'

const PUBLIC_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/reset-password/validate',
  '/api/v1/verify',
  '/health',
]

// Also keep old unversioned paths as public for the redirect middleware
const ALL_PUBLIC_PATHS = [...PUBLIC_PATHS, '/api/auth/login', '/api/auth/refresh']

function isPublicPath(path: string): boolean {
  return ALL_PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))
}

export async function createApp(): Promise<express.Application> {
  const app = express()

  // ── 1. Security headers ─────────────────────────────────────
  app.use(helmet())

  // ── 2. Version header on all responses ─────────────────────
  app.use(versionHeader())

  // ── 3. CORS ─────────────────────────────────────────────────
  const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim())
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  // ── 4. Global rate limit (Redis-backed, survives restarts) ──
  app.use(globalRateLimit())

  // ── 5. Request logging ──────────────────────────────────────
  app.use(express.json({ limit: '15mb' }))
  app.use(requestLogger())

  // ── 6a. Dev-mode local file serving (must be before auth middleware) ─────────
  if (process.env['B2_KEY_ID'] === 'dev-placeholder' || !process.env['B2_KEY_ID']) {
    const uploadsDir = devUploadsDir()
    app.use('/api/v1/files/dev-uploads', (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      next()
    }, express.static(uploadsDir))
  }

  // ── 6. Health check (no auth, no rate limit) ────────────────
  app.get('/health', async (_req, res) => {
    const health = await buildHealthStatus('gateway')
    res.status(health.status === 'down' ? 503 : 200).json(health)
  })

  // ── 7. Auth rate limit on sensitive endpoints ───────────────
  const authLimitedPaths = [
    '/api/v1/auth/login',
    '/api/v1/auth/mfa/verify',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
  ]
  app.use(authLimitedPaths, authRateLimit())

  // ── 8. JWT validation (skip public paths) ───────────────────
  app.use((req, res, next) => {
    if (isPublicPath(req.path)) {
      next()
      return
    }
    requireAuth()(req, res, next)
  })

  // ── 9. Entity context validation ────────────────────────────
  app.use((req, res, next) => {
    if (isPublicPath(req.path) || !req.auth) {
      next()
      return
    }
    void entityContextMiddleware(req, res, next)
  })

  // ── 10. Per-user rate limit (authenticated only) ─────────────
  app.use(userRateLimit())

  // ── 11. File routes (served directly from gateway) ───────────
  app.use('/api/v1/files', filesRouter)

  // ── 11b. Admin outbox routes ────────────────────────────────
  app.use('/api/v1/admin/outbox', adminOutboxRouter)

  // ── 11b-i. Inventory import (system_admin only, before proxy) ─
  app.use('/api/v1/admin/inventory-import', inventoryImportRouter)

  // ── 11b-ii. Workflow SQL import (system_admin only) ─────────
  app.use('/api/v1/admin/workflow-import', workflowImportRouter)

  // ── 11b-iii. User profile routes ────────────────────────────
  app.use('/api/v1/users', userProfileRouter)

  // ── 11b-iv. Public invoice verify (no auth required) ────────
  app.use('/api/v1/verify', verifyRouter)

  // ── 11b-v. System config (system_admin only) ─────────────────
  app.use('/api/v1/admin/system-config', systemConfigRouter)

  // ── 11b-vi. Document sequences (system_admin only) ───────────
  app.use('/api/v1/admin/document-sequences', documentSequencesRouter)

  // ── 11b-vii. Notification routing (system_admin only) ────────
  app.use('/api/v1/admin/notification-routing', notificationRoutingRouter)

  // ── 11b-viii. Global search ───────────────────────────────────
  app.use('/api/v1/search', searchRouter)

  // ── 11b-ix. Job run history (system_admin only) ───────────────
  app.use('/api/v1/admin/job-runs', jobRunsRouter)

  // ── 11c. Mobile sync routes ──────────────────────────────────
  app.use('/api/v1/mobile', mobileSyncRouter)

  // ── 12. GraphQL ──────────────────────────────────────────────
  const apollo = new ApolloServer({ typeDefs, resolvers })
  await apollo.start()

  app.use(
    '/api/v1/graphql',
    expressMiddleware(apollo, {
      context: async ({ req }) => ({ auth: req.auth }),
    }),
  )

  // ── 12. REST proxy helper ────────────────────────────────────
  const makeProxy = (serviceUrl: string, stripPrefix: string) =>
    proxy(serviceUrl, {
      proxyReqPathResolver: (req) => `${stripPrefix}${req.url}`,
      proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        if (srcReq.auth) {
          proxyReqOpts.headers = proxyReqOpts.headers ?? {}
          proxyReqOpts.headers['x-user-id'] = srcReq.auth.userId
          proxyReqOpts.headers['x-company-id'] = srcReq.auth.companyId
          proxyReqOpts.headers['x-role'] = srcReq.auth.role
          proxyReqOpts.headers['x-module'] = srcReq.auth.module
          proxyReqOpts.headers['x-session-id'] = srcReq.auth.sessionId
        }
        return proxyReqOpts
      },
    })

  // ── 13. v1 versioned routes (all services) ───────────────────
  app.use('/api/v1/auth', makeProxy(env.AUTH_SERVICE_URL, '/auth'))
  app.use('/api/v1/finance', makeProxy(env.FINANCE_SERVICE_URL, '/finance'))
  app.use('/api/v1/procurement', makeProxy(env.PROCUREMENT_SERVICE_URL, '/procurement'))
  app.use('/api/v1/inventory', makeProxy(env.INVENTORY_SERVICE_URL, '/inventory'))
  app.use('/api/v1/interco', makeProxy(env.INTERCO_SERVICE_URL, '/interco'))
  app.use('/api/v1/hr', makeProxy(env.HR_SERVICE_URL, '/hr'))
  app.use('/api/v1/notifications', makeProxy(env.NOTIFICATIONS_SERVICE_URL, '/notifications'))
  app.use('/api/v1/projects', makeProxy(env.PROJECTS_SERVICE_URL, '/projects'))
  app.use('/api/v1/manufacturing', makeProxy(env.MANUFACTURING_SERVICE_URL, '/manufacturing'))
  app.use('/api/v1/rental', makeProxy(env.RENTAL_SERVICE_URL, '/rental'))
  app.use('/api/v1/reporting', makeProxy(env.REPORTING_SERVICE_URL, '/reporting'))

  // ── 14. Backward-compat redirects (unversioned → v1) ────────
  const services = [
    'auth', 'finance', 'procurement', 'inventory', 'interco',
    'hr', 'notifications', 'projects', 'manufacturing', 'rental', 'reporting',
  ]
  for (const svc of services) {
    app.use(`/api/${svc}`, (req, res) => {
      res.redirect(301, `/api/v1/${svc}${req.path}`)
    })
  }

  return app
}
