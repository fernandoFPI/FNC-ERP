import express from 'express'
import { authRouter } from './routes/auth.js'
import { passwordResetRouter } from './routes/password-reset.js'
import { userManagementRouter } from './routes/user-management.js'
import { rolesRouter } from './routes/roles.js'
import { companyManagementRouter } from './routes/company-management.js'
import { userPermissionsRouter } from './routes/user-permissions.js'
import { roleTemplatesRouter } from './routes/role-templates.js'
import { buildHealthStatus } from '@fnc-erp/db'
import { HTTP_STATUS } from '@fnc-erp/config'

export function createApp(): express.Application {
  const app = express()
  app.disable('etag')

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  app.get('/health', async (_req, res) => {
    const health = await buildHealthStatus('auth')
    res.status(health.status === 'down' ? 503 : 200).json(health)
  })

  app.use('/auth', authRouter)
  app.use('/auth', passwordResetRouter)
  app.use('/auth/users', userManagementRouter)
  app.use('/auth/roles', rolesRouter)
  app.use('/auth/companies', companyManagementRouter)
  app.use('/auth/users', userPermissionsRouter)
  app.use('/auth/role-templates', roleTemplatesRouter)

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[auth-service] Unhandled error:', err)
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      })
    },
  )

  return app
}
