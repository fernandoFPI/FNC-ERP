// Where goods can be received (playbook #105).
//
// Every company has two SYSTEM locations: `virtual_in` ("Virtual Receipts") and `virtual_out` ("Virtual Consumption"). They are the other
// side of a stock move, not places goods are kept: stock "in" Virtual Consumption counts as used up. The Record Receipt form listed every
// active location, so a receipt could be booked into Virtual Consumption: the goods never became stock, and the project they were bought
// for was never charged (NY-PRJ-2026-0032, 13 receipts on production). The server refuses them too (services/gateway lib/receivingLocation.ts);
// this keeps them out of the pick lists so nobody is offered a choice that would be refused.

export const VIRTUAL_LOCATION_TYPES: readonly string[] = ['virtual_in', 'virtual_out']

interface HasType {
  type?: string | null
}

export function isReceivableLocation(location: HasType): boolean {
  return !VIRTUAL_LOCATION_TYPES.includes(location.type ?? '')
}

/** The locations a receipt can be booked into: everything that is not a virtual system location. */
export function receivableLocations<T extends HasType>(locations: readonly T[]): T[] {
  return locations.filter(isReceivableLocation)
}

/**
 * The same, for a screen that EDITS a receipt whose current location may be a virtual one (a receipt made before the rule): that one stays
 * in the list so the box tells the truth about what is stored, but it is the only virtual location offered.
 */
export function receivableLocationsKeeping<T extends HasType & { id: string }>(
  locations: readonly T[],
  currentId: string | null | undefined,
): T[] {
  return locations.filter(
    (l) => isReceivableLocation(l) || (currentId ? l.id === currentId : false),
  )
}
