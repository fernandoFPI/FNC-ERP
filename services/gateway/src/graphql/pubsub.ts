import { PubSub } from 'graphql-subscriptions'

// In-memory PubSub — correct as long as the gateway stays single-instance
// (it already must, for the same reason: services/gateway/src/routes/websocket.ts's
// broadcastToAll() keeps its client list in process memory too). If the
// gateway is ever horizontally scaled, this needs to become Redis-backed
// (graphql-redis-subscriptions) so an event published on one instance
// reaches subscribers connected to another.
export const pubsub = new PubSub()

export const CHANNELS = {
  SESSIONS_CHANGED_ANY: 'SESSIONS_CHANGED_ANY',
  OUTBOX_UPDATED: 'OUTBOX_UPDATED',
} as const

export function sessionsChangedChannel(userId: string): string {
  return `SESSIONS_CHANGED:${userId}`
}

export async function publishSessionsChanged(userId: string): Promise<void> {
  const payload = { userId }
  await Promise.all([
    pubsub.publish(sessionsChangedChannel(userId), payload),
    pubsub.publish(CHANNELS.SESSIONS_CHANGED_ANY, payload),
  ])
}

export async function publishOutboxUpdated(): Promise<void> {
  await pubsub.publish(CHANNELS.OUTBOX_UPDATED, { updatedAt: new Date().toISOString() })
}

export function permissionsChangedChannel(userId: string): string {
  return `PERMISSIONS_CHANGED:${userId}`
}

export async function publishPermissionsChanged(userId: string, companyId: string): Promise<void> {
  await pubsub.publish(permissionsChangedChannel(userId), { userId, companyId })
}
