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
