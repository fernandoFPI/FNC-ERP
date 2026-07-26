import { createApp } from './app.js'
import { env } from '@fnc-erp/config'
import { checkConnection, pool } from '@fnc-erp/db'
import { createServiceLogger } from '@fnc-erp/logger'

const log = createServiceLogger('finance')

const app = createApp()
const port = env.FINANCE_SERVICE_PORT

async function start() {
  try {
    await checkConnection()
    log.info('Database connection verified')
  } catch (err) {
    log.error({ err }, 'Failed to connect to database')
    process.exit(1)
  }

  const server = app.listen(port, () => {
    log.info({ port }, 'Finance service started')
    process.send?.('ready')
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') log.error({ port }, 'Port already in use')
    else log.error({ err }, 'Server error')
    process.exit(1)
  })

  const shutdown = async () => {
    log.info('Finance service shutting down')
    server.closeIdleConnections()
    server.close(async () => {
      await pool.end()
      process.exit(0)
    })
  }
  process.on('SIGTERM', () => {
    void shutdown()
  })
  process.on('SIGINT', () => {
    void shutdown()
  })
}

void start()
