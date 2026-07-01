import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { createTestUser, cleanNotificationData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
let token: string
let userId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  userId = user.userId
})

afterAll(async () => {
  await cleanNotificationData(userId)
  await pool.end()
})

describe('GET /notifications/unread-count', () => {
  it('returns zero when no notifications', async () => {
    const res = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.count).toBe(0)
  })
})

describe('POST /notifications', () => {
  it('creates a notification', async () => {
    const res = await request(app)
      .post('/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        user_id: userId,
        type: 'TEST_NOTIFICATION',
        title: 'Test Title',
        body: 'Test body content',
        data: { foo: 'bar' },
      })
    expect(res.status).toBe(201)
    expect(res.body.data.title).toBe('Test Title')
    expect(res.body.data.is_read).toBe(false)
    expect(res.body.data.company_id).toBe(TEST_COMPANY_ID)
  })
})

describe('GET /notifications', () => {
  it('lists notifications for user', async () => {
    const res = await request(app)
      .get('/notifications')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('filters unread_only', async () => {
    const res = await request(app)
      .get('/notifications?unread_only=true')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    for (const n of res.body.data as Array<{ is_read: boolean }>) {
      expect(n.is_read).toBe(false)
    }
  })
})

describe('GET /notifications/unread-count after create', () => {
  it('reflects new unread notifications', async () => {
    const res = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.count).toBeGreaterThan(0)
  })
})

describe('PATCH /notifications/:id/read', () => {
  it('marks a notification as read', async () => {
    const list = await request(app)
      .get('/notifications')
      .set('Authorization', `Bearer ${token}`)
    const notif = (list.body.data as Array<{ id: string }>)[0]!
    const res = await request(app)
      .patch(`/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.is_read).toBe(true)
    expect(res.body.data.read_at).not.toBeNull()
  })
})

describe('POST /notifications/read-all', () => {
  it('marks all unread as read', async () => {
    // Create another unread notification first
    await request(app)
      .post('/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: userId, type: 'T2', title: 'T2', body: 'body' })

    const res = await request(app)
      .post('/notifications/read-all')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(typeof res.body.data.updated).toBe('number')

    const count = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
    expect(count.body.data.count).toBe(0)
  })
})

describe('POST /notifications/push/subscribe', () => {
  it('saves a push subscription', async () => {
    const res = await request(app)
      .post('/notifications/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({
        endpoint: 'https://push.example.com/sub/test-endpoint-unique-12345',
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiaTiTnBJV6pJZO',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      })
    expect(res.status).toBe(201)
    expect(res.body.data.user_id).toBe(userId)
  })
})
