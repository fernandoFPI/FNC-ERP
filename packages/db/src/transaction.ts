import { pool, type PoolClient } from './client.js'
import { setRLSContext } from './rls.js'

export interface TransactionContext {
  companyId: string
  userId: string
  role: string
}

/**
 * Acquires a client, begins a transaction, sets RLS session variables,
 * runs fn, then commits. Rolls back automatically on any error.
 */
export async function withTransaction<T>(
  context: TransactionContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await setRLSContext(client, context.companyId, context.userId, context.role)
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

/**
 * Runs a function inside a single PostgreSQL transaction that can switch the
 * RLS company context mid-flight using SET LOCAL (transaction-scoped).
 *
 * Used ONLY for inter-company operations where two entities must be written
 * atomically on the same connection. The caller receives a switchContext()
 * helper to change the active company before each write.
 */
export async function withIntercoTransaction<T>(
  userId: string,
  fn: (
    client: PoolClient,
    switchContext: (companyId: string) => Promise<void>,
  ) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId])

    const switchContext = async (companyId: string): Promise<void> => {
      await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyId])
      await client.query(`SELECT set_config('app.current_role', 'company_admin', true)`)
    }

    const result = await fn(client, switchContext)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Acquires a client and begins a transaction WITHOUT RLS context.
 * Use only for system-level operations (migrations, seeding) where RLS is bypassed.
 */
export async function withSystemTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
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
