// Every translation key the project page reads must exist in BOTH languages. A key with no text prints its raw
// dotted name on screen, and no build, typecheck or lint notices (playbook #26, #51). 21 keys of ProjectDetail.tsx
// (the `<Trans>` ones: "Raised by:", "Location:", "Total Workforce Today:" ...) had no text at all until
// 2026-11-10; this scans the source so the next one fails here.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import en from '../locales/en.json'
import ar from '../locales/ar.json'

const source = fs.readFileSync(
  path.resolve(__dirname, '../../pages/projects/detail/ProjectDetail.tsx'),
  'utf8',
)

const keys = [
  ...new Set([
    ...[...source.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)].map((m) => m[1]),
    ...[...source.matchAll(/i18nKey="([A-Za-z0-9_.]+)"/g)].map((m) => m[1]),
  ]),
].sort()

function lookup(locale: unknown, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      locale,
    )
}

// A plural sibling (key_one, key_other, ...) counts as present.
function hasKey(locale: unknown, dotted: string): boolean {
  if (typeof lookup(locale, dotted) === 'string') return true
  const parts = dotted.split('.')
  const last = parts.pop() ?? ''
  const parent = lookup(locale, parts.join('.'))
  return (
    !!parent &&
    typeof parent === 'object' &&
    Object.keys(parent).some((k) => k.startsWith(`${last}_`))
  )
}

describe('ProjectDetail translation keys', () => {
  it('finds the keys the page reads', () => {
    expect(keys.length).toBeGreaterThan(1000)
    expect(keys).toContain('proj.detail.costAnalysis')
    expect(keys).toContain('proj.detail.location')
  })

  it.each([
    ['en', en],
    ['ar', ar],
  ] as const)('every key resolves in %s', (_name, locale) => {
    expect(keys.filter((k) => !hasKey(locale, k))).toEqual([])
  })
})

// The <Trans> strings that had no text: same highlighted parts and the same values in both languages.
const TRANS_KEYS = [
  'directCostTotal2',
  'isCurrentlyWorkingOnThisDocument',
  'supersedingMarksTheCurrentAsBuilt',
  'typeToUnlockTheConfirmButton',
  'raisedBy2',
  'drawing3',
  'spec',
  'acknowledged2',
  'voRef',
  'workPackage',
  'workPkg',
  'location',
  'inspector2',
  'attendees2',
  'ptw',
  'resp',
  'submittedValue',
  'isCurrentlyWorkingOnThisVo',
  'totalWorkforceToday',
  'totalCriticalCompleteInProgress',
  'activitiesDependencies',
] as const

const tags = (s: string) => [...s.matchAll(/<(\d+)>/g)].map((m) => m[1]).sort()
const vars = (s: string) => [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort()

describe('the <Trans> strings that were missing', () => {
  const enDetail = en.proj.detail as unknown as Record<string, string>
  const arDetail = ar.proj.detail as unknown as Record<string, string>

  it.each(TRANS_KEYS)('%s has text in both languages with the same highlighted parts', (key) => {
    expect(typeof enDetail[key]).toBe('string')
    expect(typeof arDetail[key]).toBe('string')
    // Every <n> opens and closes, and the Arabic uses the same parts as the English.
    for (const text of [enDetail[key], arDetail[key]]) {
      for (const n of tags(text)) expect(text.split(`</${n}>`).length - 1).toBe(1)
    }
    expect(tags(arDetail[key])).toEqual(tags(enDetail[key]))
    // The Arabic may leave out a value (the English "do <not>" is written into the Arabic sentence), never add one.
    for (const v of vars(arDetail[key])) expect(vars(enDetail[key])).toContain(v)
  })

  it('does not show the word to type in Arabic: the code compares an English phrase', () => {
    // The box says "Type <0>{{t}}</0>": the page passes the code's own constant, so the Arabic text must not
    // hard-code a translated word of its own.
    expect(arDetail.typeToUnlockTheConfirmButton).toBe('اكتب <0>{{t}}</0> لتفعيل زر التأكيد')
    expect('supersede2' in ar.proj.detail).toBe(false)
    expect(source).toContain('values={{ t: workflowAction.btn.requireConfirmPhrase }}')
    expect(source).toContain('placeholder={workflowAction.btn.requireConfirmPhrase}')
    expect(source).not.toMatch(/proj\.detail\.supersede2/)
  })
})
