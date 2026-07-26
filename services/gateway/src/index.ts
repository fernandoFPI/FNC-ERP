import { createApp } from './app.js'
import { env } from '@fnc-erp/config'
import { pool } from '@fnc-erp/db'
import { createServiceLogger } from '@fnc-erp/logger'
import { handleWsUpgrade } from './routes/websocket.js'

const log = createServiceLogger('gateway')

async function start() {
  let app
  try {
    app = await createApp()
  } catch (err) {
    log.error({ err }, 'Failed to initialize gateway app')
    process.exit(1)
  }

  const port = env.GATEWAY_PORT
  const server = app.listen(port, () => {
    log.info({ port }, 'Gateway service started')
    process.send?.('ready')
  })

  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? ''
    if (url.startsWith('/api/v1/ws')) {
      handleWsUpgrade(req, socket as import('net').Socket, head)
    } else {
      socket.destroy()
    }
  })

  const shutdown = async () => {
    log.info('Gateway shutting down')
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
