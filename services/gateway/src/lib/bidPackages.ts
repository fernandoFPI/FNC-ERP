// The file areas of the project's Bidding tab: Technical Bid, Commercial Bid, Cost Analysis and
// Clarifications Bid. A file is a `document_attachments` row whose `entity_id` is the project and whose
// `entity_type` says which area it belongs to (migrations 171 and 321). One map holds everything that
// differs between the areas, so the list, upload and delete resolvers cannot drift apart: the list used to
// say `entity_type === 'bid_package_technical' ? 'technical' : 'commercial'`, which would have labelled
// any new area as Commercial without an error (playbook #73).

export const BID_PACKAGE_TYPES = {
  technical: {
    entityType: 'bid_package_technical',
    label: 'Technical',
    apiHiddenFromTechnicalMembers: false,
  },
  commercial: {
    entityType: 'bid_package_commercial',
    label: 'Commercial',
    // The page has always hidden this area from a technical team member; until 2026-11-10 the API still
    // returned it to anyone with projects.bidding.view. Closed on the user's say-so (it narrows what a
    // technical member can fetch by calling the API directly; nothing the page showed them is affected).
    apiHiddenFromTechnicalMembers: true,
  },
  cost_analysis: {
    entityType: 'bid_package_cost_analysis',
    label: 'Cost Analysis',
    // Pricing material like Commercial, but enforced on the server too: the list, upload and delete all
    // use the same rule as the project Attachments tab (canSeeProjectCommercialFilesGW).
    apiHiddenFromTechnicalMembers: true,
  },
  clarifications: {
    entityType: 'bid_package_clarifications',
    label: 'Clarifications',
    apiHiddenFromTechnicalMembers: false,
  },
} as const

export type BidPackageType = keyof typeof BID_PACKAGE_TYPES

const TYPE_KEYS = Object.keys(BID_PACKAGE_TYPES) as BidPackageType[]

export function parseBidPackageType(value: string): BidPackageType {
  if ((TYPE_KEYS as string[]).includes(value)) return value as BidPackageType
  throw new Error(`bidType must be one of: ${TYPE_KEYS.map((k) => `"${k}"`).join(', ')}`)
}

// The entity types a caller may read or delete. `canSeeRestricted` is the answer of
// canSeeProjectCommercialFilesGW for this project.
export function bidPackageEntityTypes(canSeeRestricted: boolean): string[] {
  return TYPE_KEYS.filter(
    (k) => canSeeRestricted || !BID_PACKAGE_TYPES[k].apiHiddenFromTechnicalMembers,
  ).map((k) => BID_PACKAGE_TYPES[k].entityType)
}

// Never defaults: a stored entity type nobody mapped is an error, not "commercial".
export function bidTypeFromEntityType(entityType: string): BidPackageType {
  const found = TYPE_KEYS.find((k) => BID_PACKAGE_TYPES[k].entityType === entityType)
  if (!found) throw new Error(`Unknown bid package entity type: ${entityType}`)
  return found
}
