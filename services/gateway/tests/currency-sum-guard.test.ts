// Phase 2.5: a text-based CI guard for currency-blind SUM/AVG queries,
// approved as the minimal version -- no AST parser, no new lint plugin.
// Runs as a normal test in this suite (the same local run before every
// release), not a CI-only script.
//
// What it does:
// 1. Gets every table/view with a currency-bearing column straight from
//    the schema (information_schema.columns, column_name ILIKE
//    '%currency%' -- not just the literal name `currency_code`; widened
//    after `projects.budget_currency`/`project_value_currency`,
//    `products.cost_currency`, and `stock_balances.last_cost_currency`
//    turned out to be real currency columns the exact-name match missed
//    entirely), so new tables are covered automatically with no list to
//    maintain here. Each table keeps its OWN list of currency column
//    names (a table can have more than one, e.g. po_lines).
// 2. Scans every backtick template literal under services/** and apps/**
//    for one that contains SUM(/AVG( and references one of those tables
//    via FROM/JOIN.
// 3. A match is exempt if it has GROUP BY ... <col> or <col> = for ANY of
//    the matched table(s)' own currency columns, reads one of the
//    per-currency views from Phase 2.1 (v_posted_journal_balances_by_currency,
//    v_project_cost_by_currency), or carries an inline
//    `-- currency-safe: <reason>` marker (a marker with no reason fails).
// 4. Anything left over must be listed in
//    docs/finance/currency-guard-allowlist.md (file + a literal
//    substring of the query), or the test fails naming the offending
//    file:line and a snippet. Removing an entry from that doc is part of
//    fixing the thing it documents.
//
// This is deliberately a heuristic over literal source text, not a real
// SQL parser -- it can't see a WHERE clause assembled from several JS
// string fragments (a currency filter built via `conditions.push(...)`
// and joined at runtime is invisible to it; such sites carry an inline
// marker instead, same as any other exemption it can't detect from the
// literal alone).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, resolve, relative, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from '@fnc-erp/db'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const SCAN_ROOTS = ['services', 'apps']
const EXCLUDE_DIR_NAMES = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'build', '.git'])
const ALLOWLIST_PATH = join(REPO_ROOT, 'docs', 'finance', 'currency-guard-allowlist.md')

// Per-currency views from Phase 2.1 (migration 304) -- reading from these
// is treated as safe on its own, per the approved spec, even without an
// additional GROUP BY/filter in the same literal.
const SAFE_VIEWS = ['v_posted_journal_balances_by_currency', 'v_project_cost_by_currency']

const SUM_AVG_RE = /\b(SUM|AVG)\s*\(/i
const MARKER_RE = /--\s*currency-safe\s*:\s*(\S.*)/i
const TEMPLATE_LITERAL_RE = /`((?:[^`\\]|\\.)*)`/gs

export interface CurrencyTable {
  table: string
  columns: string[]
}

// A plain string is accepted for backwards compatibility (and for the
// unit tests below, which build minimal fixtures) and normalizes to the
// original currency_code-only behavior.
export type TableSpec = string | CurrencyTable

function normalizeTableSpec(t: TableSpec): CurrencyTable {
  return typeof t === 'string' ? { table: t, columns: ['currency_code'] } : t
}

export interface CurrencyBlindMatch {
  file: string
  line: number
  tables: string[]
  snippet: string
  literal: string
}

export async function getCurrencyCodeTables(): Promise<CurrencyTable[]> {
  const r = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE column_name ILIKE '%currency%' AND table_schema = 'public'
     ORDER BY table_name, column_name`,
  )
  const byTable = new Map<string, string[]>()
  for (const row of r.rows) {
    const cols = byTable.get(row.table_name) ?? []
    cols.push(row.column_name)
    byTable.set(row.table_name, cols)
  }
  return [...byTable.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([table, columns]) => ({ table, columns }))
}

function walk(dir: string, out: string[]): string[] {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (EXCLUDE_DIR_NAMES.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

// Exported so the "proves it works" test can exercise the exact exemption
// logic against a hand-written literal, without needing a real file on
// disk (and without that fixture tripping the real repo-wide scan below).
// `columns` defaults to the original currency_code-only behavior; the
// real repo-wide scan passes each matched table's own currency column
// name(s) (projects.budget_currency, po_lines.store_price_currency, …) so
// a query properly scoped by one of THOSE isn't a false positive just
// because it doesn't also say the literal word "currency_code".
export function isExemptLiteral(literal: string, columns: string[] = ['currency_code']): boolean {
  return (
    columns.some((col) => new RegExp(`GROUP\\s+BY[\\s\\S]*?${col}`, 'i').test(literal)) ||
    columns.some((col) => new RegExp(`${col}\\s*=`, 'i').test(literal)) ||
    SAFE_VIEWS.some((v) => literal.includes(v)) ||
    MARKER_RE.test(literal)
  )
}

// A marker with no reason (just `-- currency-safe:` followed by nothing,
// or `-- currency-safe` with no colon/reason at all) does not count as an
// exemption, and is reported as its own, separate failure.
function hasEmptyMarker(literal: string): boolean {
  const bare = /--\s*currency-safe\s*:?\s*$/im
  return bare.test(literal) && !MARKER_RE.test(literal)
}

export function findCurrencyBlindMatches(fileText: string, tables: TableSpec[]): Omit<CurrencyBlindMatch, 'file'>[] {
  const normalized = tables.map(normalizeTableSpec)
  const tableRegexes = normalized.map((ct) => ({
    ct,
    re: new RegExp(`\\b(FROM|JOIN)\\s+${ct.table}\\b`, 'i'),
  }))
  const matches: Omit<CurrencyBlindMatch, 'file'>[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(TEMPLATE_LITERAL_RE)
  while ((m = re.exec(fileText))) {
    const literal = m[1] ?? ''
    if (!SUM_AVG_RE.test(literal)) continue
    const matchedTables = tableRegexes.filter((tr) => tr.re.test(literal))
    if (matchedTables.length === 0) continue
    const relevantColumns = [...new Set(matchedTables.flatMap((tr) => tr.ct.columns))]
    if (isExemptLiteral(literal, relevantColumns)) continue
    const line = fileText.slice(0, m.index).split('\n').length
    matches.push({
      line,
      tables: matchedTables.map((tr) => tr.ct.table),
      snippet: literal.replace(/\s+/g, ' ').trim().slice(0, 200),
      literal,
    })
  }
  return matches
}

interface AllowlistEntry {
  id: string
  file: string
  match: string
  why: string
}

export function parseAllowlist(doc: string): AllowlistEntry[] {
  const entries: AllowlistEntry[] = []
  const sections = doc.split(/^## /m).slice(1)
  for (const section of sections) {
    const id = section.split('\n', 1)[0]!.trim()
    const fileMatch = /^- file:\s*(\S.*)$/m.exec(section)
    const matchMatch = /^- match:\s*(\S.*)$/m.exec(section)
    const whyMatch = /^- why:\s*(\S.*)$/m.exec(section)
    if (!fileMatch || !matchMatch || !whyMatch) {
      throw new Error(
        `docs/finance/currency-guard-allowlist.md section "${id}" is missing file:/match:/why: -- every entry needs all three`,
      )
    }
    entries.push({
      id,
      file: fileMatch[1]!.trim(),
      match: matchMatch[1]!.trim(),
      why: whyMatch[1]!.trim(),
    })
  }
  return entries
}

function isAllowlisted(relFile: string, literal: string, entries: AllowlistEntry[]): boolean {
  const normalized = relFile.split('\\').join('/')
  return entries.some((e) => e.file === normalized && literal.includes(e.match))
}

describe('currency-SUM guard (Phase 2.5)', () => {
  it('detects a deliberately bad cross-currency SUM (proves the guard works)', () => {
    const tables = ['purchase_orders']
    const badLiteral = `SELECT SUM(total_amount) AS total FROM purchase_orders WHERE company_id=$1`
    const matches = findCurrencyBlindMatches(`const bad = \`${badLiteral}\`` /* fake file text */, tables)
    expect(matches).toHaveLength(1)
    expect(matches[0]!.tables).toContain('purchase_orders')
  })

  it('does not flag the same query once it groups by currency_code', () => {
    const tables = ['purchase_orders']
    const okLiteral = `SELECT currency_code, SUM(total_amount) AS total FROM purchase_orders WHERE company_id=$1 GROUP BY currency_code`
    const matches = findCurrencyBlindMatches(`const ok = \`${okLiteral}\``, tables)
    expect(matches).toHaveLength(0)
  })

  it('does not flag the same query once it filters by a specific currency_code', () => {
    const tables = ['purchase_orders']
    const okLiteral = `SELECT SUM(total_amount) AS total FROM purchase_orders WHERE company_id=$1 AND currency_code=$2`
    const matches = findCurrencyBlindMatches(`const ok = \`${okLiteral}\``, tables)
    expect(matches).toHaveLength(0)
  })

  it('does not flag a query reading one of the Phase 2.1 per-currency views', () => {
    const tables = ['purchase_orders']
    const okLiteral = `SELECT SUM(amount) FROM purchase_orders JOIN v_project_cost_by_currency ON true WHERE project_id=$1`
    const matches = findCurrencyBlindMatches(`const ok = \`${okLiteral}\``, tables)
    expect(matches).toHaveLength(0)
  })

  it('a marker with a reason exempts the query', () => {
    const tables = ['purchase_orders']
    const markedLiteral = `SELECT SUM(total_amount) AS total FROM purchase_orders WHERE id=$1 -- currency-safe: scoped to one PO, one currency`
    const matches = findCurrencyBlindMatches(`const ok = \`${markedLiteral}\``, tables)
    expect(matches).toHaveLength(0)
  })

  it('treats any column whose name contains "currency" as currency-bearing, not just the literal name currency_code', () => {
    const tables: CurrencyTable[] = [{ table: 'projects', columns: ['budget_currency', 'project_value_currency'] }]
    const badLiteral = `SELECT SUM(budget_amount) AS total FROM projects WHERE company_id=$1`
    expect(findCurrencyBlindMatches(`const bad = \`${badLiteral}\``, tables)).toHaveLength(1)

    const okLiteral = `SELECT SUM(budget_amount) AS total FROM projects WHERE company_id=$1 AND budget_currency=$2`
    expect(findCurrencyBlindMatches(`const ok = \`${okLiteral}\``, tables)).toHaveLength(0)
  })

  it('a marker with no reason does not exempt the query and is flagged as malformed', () => {
    const tables = ['purchase_orders']
    const badMarkerLiteral = `SELECT SUM(total_amount) AS total FROM purchase_orders WHERE id=$1 -- currency-safe:`
    expect(hasEmptyMarker(badMarkerLiteral)).toBe(true)
    expect(isExemptLiteral(badMarkerLiteral)).toBe(false)
  })

  it('the allowlist doc parses and every entry has file/match/why', () => {
    const doc = readFileSync(ALLOWLIST_PATH, 'utf8')
    const entries = parseAllowlist(doc)
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(e.file.length).toBeGreaterThan(0)
      expect(e.match.length).toBeGreaterThan(0)
      expect(e.why.length).toBeGreaterThan(0)
    }
  })

  it('the whole repo has no un-allowlisted currency-blind SUM/AVG', async () => {
    const tables = await getCurrencyCodeTables()
    expect(tables.length).toBeGreaterThan(10) // sanity: the schema query actually returned something real

    const allowlist = parseAllowlist(readFileSync(ALLOWLIST_PATH, 'utf8'))

    const files: string[] = []
    for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files)
    expect(files.length).toBeGreaterThan(100) // sanity: we actually scanned the repo, not an empty dir
    // Exclude this guard's own test file -- its unit tests above build
    // deliberately-bad SQL-shaped fixtures (including an empty marker) to
    // exercise the detector directly; those aren't real production SQL
    // and shouldn't be reported as violations of the scan they're testing.
    const selfExcluded = files.filter((f) => !f.endsWith('currency-sum-guard.test.ts'))

    const violations: CurrencyBlindMatch[] = []
    const malformedMarkers: { file: string; line: number }[] = []
    for (const file of selfExcluded) {
      const text = readFileSync(file, 'utf8')
      const relFile = relative(REPO_ROOT, file).split('\\').join('/')
      let m: RegExpExecArray | null
      const re = new RegExp(TEMPLATE_LITERAL_RE)
      while ((m = re.exec(text))) {
        const literal = m[1] ?? ''
        if (hasEmptyMarker(literal)) {
          malformedMarkers.push({ file: relFile, line: text.slice(0, m.index).split('\n').length })
        }
      }
      for (const match of findCurrencyBlindMatches(text, tables)) {
        if (isAllowlisted(relFile, match.literal, allowlist)) continue
        violations.push({ ...match, file: relFile })
      }
    }

    if (malformedMarkers.length > 0) {
      const list = malformedMarkers.map((v) => `  ${v.file}:${v.line} -- currency-safe marker has no reason`).join('\n')
      throw new Error(`currency-safe marker(s) without a reason:\n${list}`)
    }

    if (violations.length > 0) {
      const list = violations
        .map((v) => `  ${v.file}:${v.line} [${v.tables.join(',')}]\n    ${v.snippet}`)
        .join('\n')
      throw new Error(
        `Found ${violations.length} currency-blind SUM/AVG quer${violations.length === 1 ? 'y' : 'ies'} not covered by GROUP BY currency_code, a currency_code filter, a Phase 2.1 view, a -- currency-safe marker, or docs/finance/currency-guard-allowlist.md:\n${list}`,
      )
    }
  })
})
