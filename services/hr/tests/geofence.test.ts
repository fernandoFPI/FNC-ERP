import { describe, it, expect } from 'vitest'
import { haversineDistanceMeters, isWithinGeofence } from '../src/lib/geofence.js'

// Head Office - Erbil: 36.1911, 44.0092 — geofence_radius_m = 200

describe('haversineDistanceMeters', () => {
  it('returns ~0 for identical coordinates', () => {
    const d = haversineDistanceMeters(36.1911, 44.0092, 36.1911, 44.0092)
    expect(d).toBeCloseTo(0, 1)
  })

  it('returns known distance between two Erbil points', () => {
    // ~111m per 0.001 degrees latitude
    const d = haversineDistanceMeters(36.1911, 44.0092, 36.1920, 44.0092)
    expect(d).toBeGreaterThan(80)
    expect(d).toBeLessThan(120)
  })

  it('is symmetric', () => {
    const d1 = haversineDistanceMeters(36.1911, 44.0092, 36.2100, 44.0150)
    const d2 = haversineDistanceMeters(36.2100, 44.0150, 36.1911, 44.0092)
    expect(d1).toBeCloseTo(d2, 5)
  })

  it('handles negative coordinates (southern/western hemisphere)', () => {
    const d = haversineDistanceMeters(-33.8688, 151.2093, -33.8748, 151.2093)
    expect(d).toBeGreaterThan(500)
    expect(d).toBeLessThan(800)
  })
})

describe('isWithinGeofence', () => {
  const locLat = 36.1911
  const locLon = 44.0092
  const radius = 200

  it('returns valid=true for coordinates at the exact location', () => {
    const { valid, distanceMeters } = isWithinGeofence(locLat, locLon, locLat, locLon, radius)
    expect(valid).toBe(true)
    expect(distanceMeters).toBeCloseTo(0, 1)
  })

  it('returns valid=true for coordinates within radius', () => {
    // ~50m north
    const { valid } = isWithinGeofence(36.1916, 44.0092, locLat, locLon, radius)
    expect(valid).toBe(true)
  })

  it('returns valid=false for coordinates outside radius', () => {
    // ~500m away
    const { valid, distanceMeters } = isWithinGeofence(36.1956, 44.0092, locLat, locLon, radius)
    expect(valid).toBe(false)
    expect(distanceMeters).toBeGreaterThan(radius)
  })

  it('returns accurate distance when outside geofence', () => {
    const { distanceMeters } = isWithinGeofence(36.1911, 44.0150, locLat, locLon, radius)
    // ~450m east
    expect(distanceMeters).toBeGreaterThan(350)
    expect(distanceMeters).toBeLessThan(550)
  })

  it('respects larger radius', () => {
    const { valid } = isWithinGeofence(36.1956, 44.0092, locLat, locLon, 600)
    expect(valid).toBe(true)
  })
})
