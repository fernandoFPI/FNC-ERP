import type { IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { verifyAccessToken } from '@fnc-erp/auth'
import { query } from '@fnc-erp/db'

const wss = new WebSocketServer({ noServer: true })

const PING_INTERVAL_MS = 25_000
// A socket, once open, was never rechecked against the session it was opened
// under -- ping/pong only proves the connection is alive, not that the
// underlying session still is. A tab that mostly sits on live pushes instead
// of making plain REST calls could ride this connection past both the 15m
// access token and the 7d refresh token limits, and even past an explicit
// revoke, since nothing on this path ever looked again. This is the only
// periodic recheck against `sessions`, so it's what actually makes "session
// expired" or "session revoked" true for a socket that's just sitting open.
const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000

interface AuthedWebSocket extends WebSocket {
  sessionId?: string
}

async function isSessionValid(sessionId: string): Promise<boolean> {
  const result = await query(`SELECT 1 FROM sessions WHERE id = $1 AND refresh_expires_at > NOW()`, [
    sessionId,
  ])
  return (result.rowCount ?? 0) > 0
}

wss.on('connection', (ws: AuthedWebSocket) => {
  let alive = true

  const pingTimer = setInterval(() => {
    if (!alive) {
      ws.terminate()
      return
    }
    alive = false
    ws.ping()
  }, PING_INTERVAL_MS)

  const sessionCheckTimer = ws.sessionId
    ? setInterval(() => {
        const sessionId = ws.sessionId
        if (!sessionId) return
        void isSessionValid(sessionId)
          .then((valid) => {
            if (!valid) ws.close(4001, 'Session expired')
          })
          .catch(() => {
            /* a failed check shouldn't drop a live session over a transient DB hiccup */
          })
      }, SESSION_CHECK_INTERVAL_MS)
    : null

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
    if (sessionCheckTimer) clearInterval(sessionCheckTimer)
  })
  ws.on('error', () => {
    clearInterval(pingTimer)
    if (sessionCheckTimer) clearInterval(sessionCheckTimer)
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

  let sessionId: string
  try {
    sessionId = verifyAccessToken(token).sessionId
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ;(ws as AuthedWebSocket).sessionId = sessionId
    wss.emit('connection', ws, req)
  })
}

export function broadcastToAll(payload: unknown): void {
  const data = JSON.stringify(payload)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  })
}
