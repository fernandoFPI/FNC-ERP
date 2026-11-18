import type { PoolClient } from '@fnc-erp/db'

// Where goods can be received (playbook #105).
//
// Every company has two SYSTEM locations, `virtual_in` ("Virtual Receipts") and `virtual_out` ("Virtual Consumption"). They are the
// other side of a stock move: a receipt moves stock from Virtual Receipts INTO a real place, and a Store Out moves it from a real place
// to Virtual Consumption. Stock "in" Virtual Consumption is, by definition, used up.
//
// The Record Receipt form listed every active location, including those two, and the server accepted whatever id arrived. On production
// 13 confirmed receipts were booked into Virtual Consumption (10 in October, 3 in November): the goods never became stock, no Store Out
// could ever issue them, and for a project PO delivered to inventory (NY-PRJ-2026-0032: USD 3,330.65 and IQD 79,950) nothing ever reached
// the project's cost. One rule, used by the three places a receipt location can be set, so they cannot drift.

type Exec = Pick<PoolClient, 'query'>

/** The location types that are not places goods can be kept. */
export const VIRTUAL_LOCATION_TYPES = ['virtual_in', 'virtual_out'] as const

export function isVirtualLocationType(type: string | null | undefined): boolean {
  return type === 'virtual_in' || type === 'virtual_out'
}

/** The sentence a person sees when they pick a virtual location. */
export function receivingLocationRefusal(name: string): string {
  return (
    `Goods cannot be received into "${name}": it is a virtual system location (stock put there counts as used up), ` +
    `so the goods would never become stock. Choose a warehouse or site location.`
  )
}

/** Refuses a missing location and any virtual one. A real location of any other type (warehouse, site, transit) passes. */
export async function assertReceivableLocation(exec: Exec, locationId: string): Promise<void> {
  const r = await exec.query<{ name: string; type: string }>(
    `SELECT name, type FROM stock_locations WHERE id = $1`,
    [locationId],
  )
  const location = r.rows.at(0)
  if (!location) throw new Error('The receiving location was not found.')
  if (isVirtualLocationType(location.type)) throw new Error(receivingLocationRefusal(location.name))
}
