import type { PoolClient } from '@fnc-erp/db'

export interface LocationOwnership {
  locationId: string
  companyId: string
  companyName: string
}

export async function getLocationOwnership(
  client: PoolClient,
  locationId: string,
): Promise<LocationOwnership> {
  const result = await client.query<{
    location_id: string
    company_id: string
    company_name: string
  }>(
    `SELECT sl.id AS location_id, sl.company_id, c.name AS company_name
     FROM stock_locations sl
     JOIN companies c ON c.id = sl.company_id
     WHERE sl.id = $1`,
    [locationId],
  )
  if (!result.rows[0]) {
    throw Object.assign(new Error(`Stock location ${locationId} not found`), {
      code: 'LOCATION_NOT_FOUND',
      status: 404,
    })
  }
  const r = result.rows[0]
  return {
    locationId: r.location_id,
    companyId: r.company_id,
    companyName: r.company_name,
  }
}

export async function isIntercoMove(
  client: PoolClient,
  fromLocationId: string,
  toLocationId: string,
): Promise<{ isInterco: boolean; fromCompanyId?: string; toCompanyId?: string }> {
  const [from, to] = await Promise.all([
    getLocationOwnership(client, fromLocationId),
    getLocationOwnership(client, toLocationId),
  ])

  if (from.companyId === to.companyId) {
    return { isInterco: false }
  }

  return {
    isInterco: true,
    fromCompanyId: from.companyId,
    toCompanyId: to.companyId,
  }
}
