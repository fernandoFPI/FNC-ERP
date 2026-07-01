import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { createTestUser, createTestEmployee, cleanHRData, TEST_WORK_LOCATION_ID } from './setup.js'

const app = createApp()
let token: string
let userId: string
let employeeId: string

// Head Office - Erbil: 36.1911, 44.0092 — radius 200m
const INSIDE_LAT = 36.1913   // ~22m away
const INSIDE_LON = 44.0092
const OUTSIDE_LAT = 36.1960  // ~544m away
const OUTSIDE_LON = 44.0092

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  userId = user.userId
  employeeId = await createTestEmployee(userId)
})

afterAll(async () => {
  await cleanHRData(employeeId)
  await pool.end()
})

describe('Geofenced attendance punch', () => {
  it('punch-in within geofence is marked valid', async () => {
    const res = await request(app)
      .post('/hr/attendance/punch')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, punch_type: 'in', latitude: INSIDE_LAT, longitude: INSIDE_LON })
    expect(res.status).toBe(201)
    expect(res.body.data.punch_type).toBe('in')
    expect(res.body.data.geofence_valid).toBe(true)
    expect(parseFloat(res.body.data.distance_from_location_m)).toBeLessThan(200)
  })

  it('punch-out outside geofence is marked invalid', async () => {
    const res = await request(app)
      .post('/hr/attendance/punch')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, punch_type: 'out', latitude: OUTSIDE_LAT, longitude: OUTSIDE_LON })
    expect(res.status).toBe(201)
    expect(res.body.data.geofence_valid).toBe(false)
    expect(parseFloat(res.body.data.distance_from_location_m)).toBeGreaterThan(200)
  })

  it('punch without coordinates has null geofence_valid', async () => {
    const res = await request(app)
      .post('/hr/attendance/punch')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, punch_type: 'in' })
    expect(res.status).toBe(201)
    expect(res.body.data.geofence_valid).toBeNull()
    expect(res.body.data.latitude).toBeNull()
  })

  it('returns 404 for non-existent employee', async () => {
    const res = await request(app)
      .post('/hr/attendance/punch')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: '00000000-0000-0000-0000-999999999999', punch_type: 'in' })
    expect(res.status).toBe(404)
  })

  it('GET /attendance lists punches for company', async () => {
    const res = await request(app)
      .get(`/hr/attendance?employee_id=${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(3)
  })
})
