const EARTH_RADIUS_M = 6_371_000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineDistanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

export function isWithinGeofence(
  punchLat: number, punchLon: number,
  locationLat: number, locationLon: number,
  radiusMeters: number,
): { valid: boolean; distanceMeters: number } {
  const distanceMeters = haversineDistanceMeters(punchLat, punchLon, locationLat, locationLon)
  return { valid: distanceMeters <= radiusMeters, distanceMeters }
}
