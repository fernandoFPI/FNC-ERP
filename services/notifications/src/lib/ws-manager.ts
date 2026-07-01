import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

interface AuthedSocket extends WebSocket {
  userId?: string
  companyId?: string
}

// userId → set of open sockets
const connections = new Map<string, Set<AuthedSocket>>()

export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (ws: AuthedSocket, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const userId = url.searchParams.get('userId')
    const companyId = url.searchParams.get('companyId')

    if (!userId || !companyId) {
      ws.close(1008, 'Missing userId or companyId')
      return
    }

    ws.userId = userId
    ws.companyId = companyId

    if (!connections.has(userId)) connections.set(userId, new Set())
    connections.get(userId)!.add(ws)

    ws.on('close', () => {
      connections.get(userId)?.delete(ws)
      if (connections.get(userId)?.size === 0) connections.delete(userId)
    })

    ws.on('error', () => {
      connections.get(userId)?.delete(ws)
    })
  })

  return wss
}

export function pushToUser(userId: string, payload: unknown): void {
  const sockets = connections.get(userId)
  if (!sockets) return
  const msg = JSON.stringify(payload)
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  }
}
