import { gql } from '@apollo/client'

// Excluded from GraphQL codegen (see codegen.ts's `documents` glob) — this
// query is a known pre-existing bug, unrelated to the codegen work that
// found it: the backend schema now requires a `resourceId` argument and
// returns a flat per-day array (no nested `days`), but this query and its
// one call site (ProjectDetail.tsx) were never updated to match, so the
// Resource Loading chart is currently non-functional. Fixing it needs a
// real UI decision (which resource to show, how to pick one) — tracked
// separately, not fixed here. Isolated to its own file, excluded from
// strict codegen validation, purely so the other ~2450 working operations
// in this app can still get typed; this file changes nothing about the
// query's (already-broken) runtime behavior.
export const PROJECT_RESOURCE_LOADING_QUERY = gql`
  query ProjectResourceLoading($projectId: ID!, $startDate: String!, $endDate: String!) {
    projectResourceLoading(projectId: $projectId, startDate: $startDate, endDate: $endDate) {
      resourceId
      resourceName
      unit
      maxUnitsPerDay
      days {
        date
        loadedUnits
        availableUnits
        isOverloaded
      }
    }
  }
`
