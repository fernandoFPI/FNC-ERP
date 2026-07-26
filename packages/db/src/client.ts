import pg, { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { env } from '@fnc-erp/config'

// Return DATE and TIMESTAMP columns as plain strings to avoid timezone conversion
// by the pg driver (pg converts DATE → JS Date using local timezone which corrupts values)
pg.types.setTypeParser(1082, (val: string) => val)   // DATE
pg.types.setTypeParser(1114, (val: string) => val)   // TIMESTAMP WITHOUT TIME ZONE
pg.types.setTypeParser(1184, (val: string) => val)   // TIMESTAMP WITH TIME ZONE

const dbUrl = env.NODE_ENV === 'test' ? (env.DATABASE_TEST_URL ?? env.DATABASE_URL) : env.DATABASE_URL

export const pool = new Pool({
  connectionString: dbUrl,
  max: env.NODE_ENV === 'production' ? env.DB_POOL_MAX : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message)
})

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  const start = Date.now()
  try {
    const result = await pool.query<R>(text, params)
    const duration = Date.now() - start
    if (env.NODE_ENV === 'development') {
      console.warn(`[db] query ${duration}ms — ${text.slice(0, 80)}`)
    }
    return result
  } catch (err) {
    console.error('[db] Query error:', { text: text.slice(0, 80), err })
    throw err
  }
}

export async function checkConnection(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('SELECT 1')
  } finally {
    client.release()
  }
}

export type { PoolClient, QueryResult }
