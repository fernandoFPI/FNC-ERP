import { readFileSync } from 'fs'
import pg from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(__dirname, 'migrations/096_company_letterhead_image.sql'), 'utf8')

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query(sql)
await client.end()
console.log('Migration 096 applied: letterhead_image added to companies')
