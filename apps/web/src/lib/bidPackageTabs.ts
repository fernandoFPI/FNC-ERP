// The file areas on a project's Bidding tab, in the order the sub-tabs appear. Each is a "bid package" of
// uploaded files (the server keeps them as document_attachments of entity type bid_package_<kind>,
// migrations 171 and 321). The kinds are pinned to the gateway's own list by a test
// (lib/__tests__/bidPackageTabs.test.ts), so a kind added on one side fails there instead of showing up as
// a tab that uploads into the wrong place.

export const BID_PACKAGE_KINDS = [
  'technical',
  'commercial',
  'cost_analysis',
  'clarifications',
] as const
export type BidPackageKind = (typeof BID_PACKAGE_KINDS)[number]

// Pricing material: not shown to a technical-only team member. The server enforces the same list at the API
// (services/gateway/src/lib/bidPackages.ts); a test keeps the two lists equal.
export const BID_PACKAGE_KINDS_HIDDEN_FROM_TECHNICAL: readonly BidPackageKind[] = [
  'commercial',
  'cost_analysis',
]

export function visibleBidPackageKinds(canSeePricing: boolean): BidPackageKind[] {
  return BID_PACKAGE_KINDS.filter(
    (k) => canSeePricing || !BID_PACKAGE_KINDS_HIDDEN_FROM_TECHNICAL.includes(k),
  )
}

export function isBidPackageKind(value: string | null | undefined): value is BidPackageKind {
  return (BID_PACKAGE_KINDS as readonly string[]).includes(value ?? '')
}
