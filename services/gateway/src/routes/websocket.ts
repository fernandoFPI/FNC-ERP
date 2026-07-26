import type { IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { verifyAccessToken } from '@fnc-erp/auth'

const wss = new WebSocketServer({ noServer: true })

const PING_INTERVAL_MS = 25_000

wss.on('connection', (ws: WebSocket) => {
  let alive = true

  const pingTimer = setInterval(() => {
    if (!alive) {
      ws.terminate()
      return
    }
    alive = false
    ws.ping()
  }, PING_INTERVAL_MS)

  ws.on('pong', () => {
    alive = true
  })

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type?: string }
      if (msg.type === 'pong') alive = true
    } catch {
      /* ignore */
    }
  })

  ws.on('close', () => {
    clearInterval(pingTimer)
  })
  ws.on('error', () => {
    clearInterval(pingTimer)
    ws.terminate()
  })
})

export function handleWsUpgrade(
  req: IncomingMessage,
  socket: import('net').Socket,
  head: Buffer,
): void {
  const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
  const token = url.searchParams.get('token')

  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  try {
    verifyAccessToken(token)
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
}

export function broadcastToAll(payload: unknown): void {
  const data = JSON.stringify(payload)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  })
}
