import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sql = fs.readFileSync(path.join(__dirname, 'migrations/095_po_line_audit_flagged_by.sql'), 'utf8')

const client = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/fnc_erp' })
await client.connect()
try {
  await client.query(sql)
  console.log('Migration 095 applied successfully.')
} finally {
  await client.end()
}
