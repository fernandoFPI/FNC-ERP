import type { IncomingMessage } from 'http'
import { WebSocketServer as WSServer } from 'ws'
import { useServer, type WebSocketServer } from 'graphql-ws/lib/use/ws'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { verifyAccessToken } from '@fnc-erp/auth'
import { typeDefs } from '../graphql/schema.js'
import { resolvers } from '../graphql/resolvers.js'

// Separate WebSocket server from services/gateway/src/routes/websocket.ts's
// ad hoc notification channel — GraphQL subscriptions get their own path and
// protocol (graphql-ws) rather than being bolted onto that one's message format.
const schema = makeExecutableSchema({ typeDefs, resolvers })

// Typed via graphql-ws's own re-exported WebSocketServer (not `ws`'s directly)
// so it structurally matches what useServer() expects under this project's
// strict TS settings (exactOptionalPropertyTypes surfaces an otherwise-benign
// type-identity mismatch between the two import paths).
const wss: WebSocketServer = new WSServer({ noServer: true })

interface SubscriptionAuth {
  userId: string
  companyId: string
  role: string
  module: string
  sessionId: string
}

useServer<Record<string, unknown> | undefined, { auth?: SubscriptionAuth }>(
  {
    schema,
    context: (ctx) => ({ auth: ctx.extra.auth }),
    onConnect: (ctx) => {
      const params = ctx.connectionParams as { authorization?: string } | undefined
      const authHeader = params?.authorization
      if (!authHeader?.startsWith('Bearer ')) return false
      try {
        const payload = verifyAccessToken(authHeader.slice(7))
        ctx.extra.auth = {
          userId: payload.sub,
          companyId: payload.companyId,
          role: payload.role,
          module: payload.module,
          sessionId: payload.sessionId,
        }
        return true
      } catch {
        return false
      }
    },
  },
  wss,
)

export function handleGraphQLWsUpgrade(
  req: IncomingMessage,
  socket: import('net').Socket,
  head: Buffer,
): void {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
}
