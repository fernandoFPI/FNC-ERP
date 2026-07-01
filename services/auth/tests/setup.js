"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_ADMIN_PASSWORD = exports.TEST_ADMIN_EMAIL = exports.TEST_USER_PASSWORD = exports.TEST_USER_EMAIL = exports.TEST_COMPANY_ID = void 0;
exports.cleanTestData = cleanTestData;
exports.createTestUser = createTestUser;
exports.createTestUserWithMFA = createTestUserWithMFA;
const db_1 = require("@fnc-erp/db");
const auth_1 = require("@fnc-erp/auth");
const auth_2 = require("@fnc-erp/auth");
const auth_3 = require("@fnc-erp/auth");
exports.TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
exports.TEST_USER_EMAIL = 'test-user@fnc-erp.local';
exports.TEST_USER_PASSWORD = 'TestPass123!';
exports.TEST_ADMIN_EMAIL = 'admin@fnc-erp.local';
exports.TEST_ADMIN_PASSWORD = 'ChangeMe123!';
async function cleanTestData() {
    await db_1.pool.query(`DELETE FROM sessions WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%fnc-erp.local'
  )`);
    await db_1.pool.query(`DELETE FROM user_company_roles WHERE user_id IN (
    SELECT id FROM users WHERE email = $1
  )`, [exports.TEST_USER_EMAIL]);
    await db_1.pool.query(`DELETE FROM users WHERE email = $1`, [exports.TEST_USER_EMAIL]);
}
async function createTestUser(overrides = {}) {
    const passwordHash = await (0, auth_1.hashPassword)(exports.TEST_USER_PASSWORD);
    const result = await db_1.pool.query(`INSERT INTO users (email, password_hash, mfa_enabled, failed_login_attempts, locked_until)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`, [
        exports.TEST_USER_EMAIL,
        passwordHash,
        overrides.mfaEnabled ?? false,
        overrides.failedAttempts ?? 0,
        overrides.lockedUntil ?? null,
    ]);
    const userId = result.rows[0].id;
    await db_1.pool.query(`INSERT INTO user_company_roles (user_id, company_id, role, module)
     VALUES ($1, $2, 'user', 'all')`, [userId, exports.TEST_COMPANY_ID]);
    return userId;
}
async function createTestUserWithMFA() {
    const passwordHash = await (0, auth_1.hashPassword)(exports.TEST_USER_PASSWORD);
    const { secret } = (0, auth_3.generateMFASecret)(exports.TEST_USER_EMAIL);
    const encryptedSecret = (0, auth_2.encrypt)(secret);
    const result = await db_1.pool.query(`INSERT INTO users (email, password_hash, mfa_enabled, mfa_secret)
     VALUES ($1, $2, true, $3)
     RETURNING id`, [exports.TEST_USER_EMAIL, passwordHash, encryptedSecret]);
    const userId = result.rows[0].id;
    await db_1.pool.query(`INSERT INTO user_company_roles (user_id, company_id, role, module)
     VALUES ($1, $2, 'user', 'all')`, [userId, exports.TEST_COMPANY_ID]);
    return { userId, mfaSecret: secret };
}
//# sourceMappingURL=setup.js.map