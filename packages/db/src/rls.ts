import { pool, type PoolClient } from './client.js'

/**
 * Sets PostgreSQL session variables consumed by RLS policies, then runs fn.
 * SET LOCAL is used so variables are scoped to the current transaction only.
 * MUST be called inside a transaction — callers should use withTransaction instead.
 */
export async function setRLSContext(
  client: PoolClient,
  companyId: string,
  userId: string,
  role: string,
): Promise<void> {
  await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyId])
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId])
  await client.query(`SELECT set_config('app.current_role', $1, true)`, [role])
}

export async function withRLS<T>(
  companyId: string,
  userId: string,
  role: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await setRLSContext(client, companyId, userId, role)
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
