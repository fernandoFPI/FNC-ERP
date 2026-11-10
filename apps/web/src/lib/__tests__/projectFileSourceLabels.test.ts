// The project's Attachments tab says where each file came from with proj.detail.fileSource.<source>. The
// sources are listed once, in the gateway (services/gateway/src/lib/projectFiles.ts). A source without a label
// prints the raw dotted key in the column, which no build or typecheck notices (playbook #26, #51). Found
// when the Cost Analysis and Clarifications sources were added and the old "tq" label had to go.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'

const registry = fs.readFileSync(
  path.resolve(__dirname, '../../../../../services/gateway/src/lib/projectFiles.ts'),
  'utf8',
)
const sourceKeys = [...registry.matchAll(/^ {4}key: '(\w+)',$/gm)].map((m) => m[1])

describe('project file source labels', () => {
  it('finds the sources in the gateway registry', () => {
    expect(sourceKeys.length).toBeGreaterThan(15)
    expect(sourceKeys).toContain('bid_cost_analysis')
    expect(sourceKeys).toContain('bid_clarifications')
    expect(sourceKeys).not.toContain('tq')
  })

  describe.each([
    ['en', en],
    ['ar', ar],
  ] as const)('%s', (_name, locale) => {
    const labels = locale.proj.detail.fileSource as Record<string, string>

    it('has a label for every source the server can return', () => {
      const missing = sourceKeys.filter((k) => typeof labels[k] !== 'string' || labels[k] === '')
      expect(missing).toEqual([])
    })

    it('keeps no label for a source that no longer exists', () => {
      const extra = Object.keys(labels).filter((k) => !sourceKeys.includes(k))
      expect(extra).toEqual([])
    })
  })
})
