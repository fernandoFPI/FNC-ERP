// Every translation key the shell (sidebar, top bar, switchers, bottom bar, drawers) asks for must exist in BOTH languages. A key that is
// missing prints the raw dotted name on screen and nothing fails (playbook #26, #51), and the shell is the one place every page shows.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import en from '../../../i18n/locales/en.json'
import ar from '../../../i18n/locales/ar.json'

const shellDir = path.resolve(__dirname, '..')
const sources = fs
  .readdirSync(shellDir)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, text: fs.readFileSync(path.join(shellDir, f), 'utf8') }))

function keysUsedIn(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_.]+)['"`]/g)) found.add(m[1])
  for (const m of text.matchAll(/i18nKey=["']([a-zA-Z0-9_.]+)["']/g)) found.add(m[1])
  return [...found]
}

function resolves(tree: unknown, key: string): boolean {
  let node: unknown = tree
  const parts = key.split('.')
  for (let i = 0; i < parts.length; i++) {
    if (typeof node !== 'object' || node === null) return false
    const obj = node as Record<string, unknown>
    const part = parts[i]
    if (i === parts.length - 1) {
      // a plural group: `key_one` / `key_other` / the six Arabic forms count as the key being present
      return part in obj || Object.keys(obj).some((k) => k.startsWith(`${part}_`))
    }
    node = obj[part]
  }
  return false
}

describe('shell translation keys', () => {
  it('finds the keys it is meant to check (a scan that finds nothing proves nothing)', () => {
    const all = sources.flatMap((s) => keysUsedIn(s.text))
    expect(all.length).toBeGreaterThan(30)
    expect(all).toContain('shell.collapseSidebar')
    expect(all).toContain('shell.breadcrumb')
    expect(all).toContain('shell.notificationsUnread')
    expect(all).toContain('common.switchLanguage')
  })

  for (const { file, text } of sources) {
    const keys = keysUsedIn(text)
    if (keys.length === 0) continue
    describe(file, () => {
      for (const key of keys) {
        it(`${key} exists in English and in Arabic`, () => {
          expect(resolves(en, key), `${key} missing in en.json`).toBe(true)
          expect(resolves(ar, key), `${key} missing in ar.json`).toBe(true)
        })
      }
    })
  }

  it('gives the count placeholder to the unread-notifications label in both languages', () => {
    const shellEn = (en as unknown as { shell: Record<string, string> }).shell
    const shellAr = (ar as unknown as { shell: Record<string, string> }).shell
    expect(shellEn.notificationsUnread).toContain('{{count}}')
    expect(shellAr.notificationsUnread).toContain('{{count}}')
  })
})
