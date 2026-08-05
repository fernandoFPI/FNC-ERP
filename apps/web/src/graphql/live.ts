import { gql } from '@apollo/client'

// Generic live-update signal — see services/gateway/src/graphql/pubsub.ts's
// entityChangedChannel. entityType is a free-form string agreed per page
// ('purchase_order', 'project', 'vendor', ...), not a GraphQL enum, so wiring
// up a new area never requires a schema change.
export const ENTITY_CHANGED_SUBSCRIPTION = gql`
  subscription OnEntityChanged($companyId: ID!, $entityType: String!) {
    entityChanged(companyId: $companyId, entityType: $entityType) {
      companyId
      entityType
      entityId
      action
      updatedAt
    }
  }
`

// Record locking ("someone else is editing this") — see
// services/gateway/src/graphql/resolvers.ts's acquireLock/heartbeatLock/
// releaseLock and pubsub.ts's lockChangedChannel.
const RECORD_LOCK_FIELDS = gql`
  fragment RecordLockFields on RecordLock {
    entityType
    entityId
    lockedBy
    lockedByName
    lockedAt
    lockedByMe
  }
`

export const RECORD_LOCK_QUERY = gql`
  query RecordLock($entityType: String!, $entityId: ID!) {
    recordLock(entityType: $entityType, entityId: $entityId) {
      ...RecordLockFields
    }
  }
  ${RECORD_LOCK_FIELDS}
`

export const ACQUIRE_LOCK_MUTATION = gql`
  mutation AcquireLock($entityType: String!, $entityId: ID!) {
    acquireLock(entityType: $entityType, entityId: $entityId) {
      ...RecordLockFields
    }
  }
  ${RECORD_LOCK_FIELDS}
`

export const HEARTBEAT_LOCK_MUTATION = gql`
  mutation HeartbeatLock($entityType: String!, $entityId: ID!) {
    heartbeatLock(entityType: $entityType, entityId: $entityId)
  }
`

export const RELEASE_LOCK_MUTATION = gql`
  mutation ReleaseLock($entityType: String!, $entityId: ID!) {
    releaseLock(entityType: $entityType, entityId: $entityId)
  }
`

export const LOCK_CHANGED_SUBSCRIPTION = gql`
  subscription OnLockChanged($entityType: String!, $entityId: ID!) {
    lockChanged(entityType: $entityType, entityId: $entityId) {
      entityType
      entityId
      lock {
        ...RecordLockFields
      }
    }
  }
  ${RECORD_LOCK_FIELDS}
`
