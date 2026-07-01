import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
const filename = process.argv[2]
if (!filename) { console.error('Usage: tsx mark-applied.ts <filename>'); process.exit(1) }

const client = await pool.connect()
try {
  await client.query(
    `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
    [filename],
  )
  console.log(`Marked as applied: ${filename}`)
} finally {
  client.release()
  await pool.end()
}
