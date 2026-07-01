import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import request from 'supertest'
import { authenticator } from 'otplib'
import { createApp } from '../src/app.js'
import { pool, query } from '@fnc-erp/db'
import {
  cleanTestData,
  createTestUser,
  createTestUserWithMFA,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_COMPANY_ID,
} from './setup.js'

const app = createApp()

beforeEach(async () => {
  await cleanTestData()
})

afterEach(async () => {
  await cleanTestData()
})

afterAll(async () => {
  await pool.end()
})

// ── Login flow ────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@fnc-erp.local', password: 'any' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns same error message for wrong password (no user enumeration)', async () => {
    await createTestUser()
    const res = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: 'WrongPassword123!' })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    expect(res.body.error.message).toBe('Email or password is incorrect')
  })

  it('increments failed_login_attempts on wrong password', async () => {
    await createTestUser()
    await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: 'WrongPassword123!' })

    const result = await query<{ failed_login_attempts: number }>(
      `SELECT failed_login_attempts FROM users WHERE email = $1`,
      [TEST_USER_EMAIL],
    )
    expect(result.rows[0]?.failed_login_attempts).toBe(1)
  })

  it('locks account after 5 failed attempts', async () => {
    await createTestUser()
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/auth/login')
        .send({ email: TEST_USER_EMAIL, password: 'WrongPassword123!' })
    }

    const result = await query<{ locked_until: Date | null; failed_login_attempts: number }>(
      `SELECT locked_until, failed_login_attempts FROM users WHERE email = $1`,
      [TEST_USER_EMAIL],
    )
    expect(result.rows[0]?.failed_login_attempts).toBe(5)
    expect(result.rows[0]?.locked_until).not.toBeNull()

    // Next attempt should return ACCOUNT_LOCKED
    const res = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED')
  })

  it('returns accessToken and refreshToken on successful login', async () => {
    await createTestUser()
    const res = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.accessToken).toBeTruthy()
    expect(res.body.data.refreshToken).toBeTruthy()
    expect(res.body.data.user.email).toBe(TEST_USER_EMAIL)
    expect(res.body.data.companies).toBeInstanceOf(Array)
  })

  it('resets failed_login_attempts to 0 on successful login', async () => {
    await createTestUser({ failedAttempts: 3 })
    await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const result = await query<{ failed_login_attempts: number }>(
      `SELECT failed_login_attempts FROM users WHERE email = $1`,
      [TEST_USER_EMAIL],
    )
    expect(result.rows[0]?.failed_login_attempts).toBe(0)
  })

  it('returns requiresMFA: true when MFA is enabled', async () => {
    await createTestUserWithMFA()
    const res = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.data.requiresMFA).toBe(true)
    expect(res.body.data.tempToken).toBeTruthy()
    expect(res.body.data.accessToken).toBeUndefined()
  })
})

// ── MFA flow ──────────────────────────────────────────────────────────────────

describe('MFA flow', () => {
  it('MFA setup generates a valid TOTP secret', async () => {
    await createTestUser()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { accessToken } = loginRes.body.data as { accessToken: string }

    const setupRes = await request(app)
      .post('/auth/mfa/setup')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(setupRes.status).toBe(200)
    expect(setupRes.body.data.secret).toBeTruthy()
    expect(setupRes.body.data.otpauthUrl).toMatch(/^otpauth:\/\//)
  })

  it('MFA confirm enables MFA after valid TOTP code', async () => {
    await createTestUser()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { accessToken } = loginRes.body.data as { accessToken: string }

    const setupRes = await request(app)
      .post('/auth/mfa/setup')
      .set('Authorization', `Bearer ${accessToken}`)

    const { secret } = setupRes.body.data as { secret: string }
    const totpCode = authenticator.generate(secret)

    const confirmRes = await request(app)
      .post('/auth/mfa/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ totpCode })

    expect(confirmRes.status).toBe(200)
    expect(confirmRes.body.data.mfaEnabled).toBe(true)
  })

  it('MFA verify returns tokens after valid TOTP code', async () => {
    const { mfaSecret } = await createTestUserWithMFA()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { tempToken } = loginRes.body.data as { tempToken: string }
    const totpCode = authenticator.generate(mfaSecret)

    const verifyRes = await request(app)
      .post('/auth/mfa/verify')
      .send({ tempToken, totpCode })

    expect(verifyRes.status).toBe(200)
    expect(verifyRes.body.data.accessToken).toBeTruthy()
    expect(verifyRes.body.data.refreshToken).toBeTruthy()
  })

  it('MFA verify returns 401 with invalid TOTP code', async () => {
    await createTestUserWithMFA()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { tempToken } = loginRes.body.data as { tempToken: string }

    const verifyRes = await request(app)
      .post('/auth/mfa/verify')
      .send({ tempToken, totpCode: '000000' })

    expect(verifyRes.status).toBe(401)
    expect(verifyRes.body.error.code).toBe('MFA_INVALID')
  })
})

// ── Token flow ────────────────────────────────────────────────────────────────

describe('Token flow', () => {
  it('refresh issues new access token with valid refresh token', async () => {
    await createTestUser()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { refreshToken } = loginRes.body.data as { refreshToken: string }

    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken })

    expect(refreshRes.status).toBe(200)
    expect(refreshRes.body.data.accessToken).toBeTruthy()
  })

  it('refresh returns 401 with invalid refresh token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'invalid.token.here' })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('TOKEN_EXPIRED')
  })

  it('logout deletes session — subsequent refresh fails', async () => {
    await createTestUser()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { accessToken, refreshToken } = loginRes.body.data as {
      accessToken: string
      refreshToken: string
    }

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)

    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken })

    expect(refreshRes.status).toBe(401)
  })
})

// ── Company switch ─────────────────────────────────────────────────────────────

describe('POST /auth/company/switch', () => {
  it('returns new token with correct companyId', async () => {
    await createTestUser()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { accessToken } = loginRes.body.data as { accessToken: string }

    const switchRes = await request(app)
      .post('/auth/company/switch')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ companyId: TEST_COMPANY_ID })

    expect(switchRes.status).toBe(200)
    expect(switchRes.body.data.accessToken).toBeTruthy()
  })

  it('returns 403 when switching to company user has no role in', async () => {
    await createTestUser()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { accessToken } = loginRes.body.data as { accessToken: string }

    const switchRes = await request(app)
      .post('/auth/company/switch')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ companyId: '00000000-0000-0000-0000-000000000003' })

    expect(switchRes.status).toBe(403)
    expect(switchRes.body.error.code).toBe('FORBIDDEN')
  })
})

// ── Audit log ─────────────────────────────────────────────────────────────────

describe('Audit log', () => {
  it('writes LOGIN event on successful login', async () => {
    await createTestUser()
    await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const userResult = await query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [TEST_USER_EMAIL],
    )
    const userId = userResult.rows[0]?.id

    const auditResult = await query<{ action: string }>(
      `SELECT action FROM audit_log WHERE user_id = $1 AND action = 'LOGIN' ORDER BY created_at DESC LIMIT 1`,
      [userId],
    )
    expect(auditResult.rows[0]?.action).toBe('LOGIN')
  })

  it('writes LOGOUT event on logout', async () => {
    await createTestUser()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { accessToken } = loginRes.body.data as { accessToken: string }

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)

    const userResult = await query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [TEST_USER_EMAIL],
    )
    const userId = userResult.rows[0]?.id

    const auditResult = await query<{ action: string }>(
      `SELECT action FROM audit_log WHERE user_id = $1 AND action = 'LOGOUT' ORDER BY created_at DESC LIMIT 1`,
      [userId],
    )
    expect(auditResult.rows[0]?.action).toBe('LOGOUT')
  })

  it('writes COMPANY_SWITCH event on company switch', async () => {
    await createTestUser()
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

    const { accessToken } = loginRes.body.data as { accessToken: string }

    await request(app)
      .post('/auth/company/switch')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ companyId: TEST_COMPANY_ID })

    const userResult = await query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [TEST_USER_EMAIL],
    )
    const userId = userResult.rows[0]?.id

    const auditResult = await query<{ action: string }>(
      `SELECT action FROM audit_log WHERE user_id = $1 AND action = 'COMPANY_SWITCH' ORDER BY created_at DESC LIMIT 1`,
      [userId],
    )
    expect(auditResult.rows[0]?.action).toBe('COMPANY_SWITCH')
  })
})

// ── Health check ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('auth')
  })
})
