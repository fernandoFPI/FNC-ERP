import { readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

const connectionString =
  process.env['NODE_ENV'] === 'test'
    ? (process.env['DATABASE_TEST_URL'] ?? process.env['DATABASE_URL'])
    : process.env['DATABASE_URL']

if (!connectionString) {
  console.error('[migrate] DATABASE_URL is not set')
  process.exit(1)
}

const pool = new Pool({ connectionString })

async function runMigrations() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Auto-discover all .sql files, sorted alphabetically (001 before 002, etc.)
    const allFiles = readdirSync(__dirname)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const appliedResult = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    )
    const applied = new Set(appliedResult.rows.map((r) => r.filename))

    const pending = allFiles.filter((f) => !applied.has(f))

    if (pending.length === 0) {
      console.warn('[migrate] All migrations already applied.')
      return
    }

    console.warn(`[migrate] ${pending.length} pending migration(s): ${pending.join(', ')}`)

    for (const file of pending) {
      const sqlPath = join(__dirname, file)
      // Strip embedded BEGIN/COMMIT so each file runs in its own managed transaction
      const raw = readFileSync(sqlPath, 'utf8')
      const sql = raw.replace(/^\s*BEGIN\s*;/gim, '').replace(/^\s*COMMIT\s*;/gim, '')

      await client.query('BEGIN')
      try {
        console.warn(`[migrate] Applying: ${file}`)
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.warn(`[migrate] Done: ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }
    console.warn('[migrate] All migrations applied successfully.')
  } catch (err) {
    console.error('[migrate] Migration failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

await runMigrations()
