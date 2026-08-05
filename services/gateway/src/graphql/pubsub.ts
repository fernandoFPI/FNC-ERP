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

// Generic "something in this company's data changed" signal. Rather than a
// bespoke channel/type per entity (sessionsChanged, outboxUpdated, etc. were
// each worth their own shape), most list/detail pages just need "refetch me
// when X changes" — entityType is a free-form string the frontend agrees on
// per page (e.g. 'purchase_order', 'project', 'vendor'), not a GraphQL enum,
// so adding live updates to a new area never requires a schema change.
export function entityChangedChannel(companyId: string, entityType: string): string {
  return `ENTITY_CHANGED:${companyId}:${entityType}`
}

export async function publishEntityChanged(
  companyId: string,
  entityType: string,
  entityId: string,
  action: 'created' | 'updated' | 'deleted',
): Promise<void> {
  await pubsub.publish(entityChangedChannel(companyId, entityType), {
    companyId,
    entityType,
    entityId,
    action,
    updatedAt: new Date().toISOString(),
  })
}

// Record locking ("someone else is editing this") — one channel per
// (entityType, entityId), same free-form-string convention as entityChanged
// above. Payload carries the full current lock state (or null when released/
// expired) since, unlike entityChanged, there's nothing to refetch here —
// the lock state itself IS the payload.
export function lockChangedChannel(entityType: string, entityId: string): string {
  return `LOCK_CHANGED:${entityType}:${entityId}`
}

export interface LockState {
  entityType: string
  entityId: string
  lockedBy: string
  lockedByName: string
  lockedAt: string
}

export async function publishLockChanged(
  entityType: string,
  entityId: string,
  lock: LockState | null,
): Promise<void> {
  await pubsub.publish(lockChangedChannel(entityType, entityId), { entityType, entityId, lock })
}
