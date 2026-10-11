import { describe, it, expect, afterEach } from 'vitest'
import en from '../locales/en.json'
import ar from '../locales/ar.json'
import i18n, { tl, tlh, enumLabel } from '../index'
import { PERMISSION_REGISTRY } from '../../lib/permissionRegistry'

interface Tree {
  [k: string]: string | Tree
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const ARABIC_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other']

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out[prefix + k] = v
    else Object.assign(out, flatten(v, prefix + k + '.'))
  }
  return out
}

const enFlat: Record<string, string | undefined> = flatten(en as Tree)
const arFlat = flatten(ar as Tree)
const base = (k: string) => k.replace(PLURAL_SUFFIX, '')
const placeholders = (s: string) => new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))

describe('locale files', () => {
  it('have the same keys in English and Arabic (ignoring plural suffixes)', () => {
    const enKeys = new Set(Object.keys(enFlat).map(base))
    const arKeys = new Set(Object.keys(arFlat).map(base))
    expect([...enKeys].filter((k) => !arKeys.has(k))).toEqual([])
    expect([...arKeys].filter((k) => !enKeys.has(k))).toEqual([])
  })

  it('give every plural Arabic key all six CLDR forms', () => {
    const bases = new Set(Object.keys(arFlat).filter((k) => PLURAL_SUFFIX.test(k)).map(base))
    const missing: string[] = []
    for (const b of bases) {
      for (const f of ARABIC_FORMS) if (!(`${b}_${f}` in arFlat)) missing.push(`${b}_${f}`)
    }
    expect(missing).toEqual([])
  })

  it('use only placeholders that exist in the English string', () => {
    const bad: string[] = []
    for (const [k, v] of Object.entries(arFlat)) {
      const enText = enFlat[k] ?? enFlat[base(k) + '_other'] ?? enFlat[base(k)]
      if (enText === undefined) continue
      const allowed = placeholders(enText)
      allowed.add('count')
      for (const p of placeholders(v)) if (!allowed.has(p)) bad.push(`${k}: {{${p}}}`)
    }
    expect(bad).toEqual([])
  })

  it('have no empty translations', () => {
    expect(Object.entries(arFlat).filter(([, v]) => v.trim() === '')).toEqual([])
  })
})

describe('language switching', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('flips <html dir> and lang with the language', async () => {
    await i18n.changeLanguage('ar')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
    await i18n.changeLanguage('en')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
  })

  it('pluralises Arabic counts', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.t('po.detail.itemsOnOrder', { count: 2 })).toBe('مادتان في هذا الأمر.')
    expect(i18n.t('po.detail.itemsOnOrder', { count: 11 })).toContain('11')
  })

  it('re-evaluates lazy module-level labels when the language changes', async () => {
    const first = PERMISSION_REGISTRY[0]
    await i18n.changeLanguage('en')
    expect(first.label).toBe('Finance')
    await i18n.changeLanguage('ar')
    expect(first.label).toBe('المالية')
    expect(first.submodules[0].permissions[0].label).not.toMatch(/^[A-Za-z ]+$/)
  })

  it('falls back to the English default for an unknown key', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.t('nav.Some Brand New Page', { defaultValue: 'Some Brand New Page' })).toBe('Some Brand New Page')
  })

  it('translates closed-set labels through tl() and keeps the English fallback', async () => {
    await i18n.changeLanguage('ar')
    expect(tl('proj.detail.docCatOpts', 'HSE', 'HSE')).toBe('الصحة والسلامة والبيئة')
    expect(tl('proj.detail.statusOpts', 'on_hold', 'on hold')).toBe('معلّق')
    expect(tl('proj.detail.statusOpts', 'some_new_status', 'some new status')).toBe('some new status')
  })

  it('pluralises the Projects overview strings (all six Arabic forms)', async () => {
    await i18n.changeLanguage('ar')
    const t = (k: string, count: number) => i18n.t(k, { count })
    expect(t('proj.detail.alertPoAwaiting', 1)).toBe('أمر شراء واحد بانتظار الموافقة')
    expect(t('proj.detail.alertPoAwaiting', 2)).toBe('أمرا شراء بانتظار الموافقة')
    expect(t('proj.detail.alertPoAwaiting', 3)).toBe('3 أوامر شراء بانتظار الموافقة')
    expect(t('proj.detail.alertPoAwaiting', 11)).toBe('11 أمر شراء بانتظار الموافقة')
    expect(i18n.t('proj.detail.uploadedDocsFailed', { count: 4, failed: 1 })).toBe('تم رفع 4 مستندات، وفشل 1')
    expect(t('proj.detail.daysAgo', 5)).toBe('قبل 5 أيام')
  })

  it('keeps a header slug that equals a plural word out of the plural namespace', async () => {
    await i18n.changeLanguage('ar')
    expect(tlh('proj.detail', 'other')).toBe('أخرى')
    expect(tlh('proj.detail', 'Totally Unknown Header')).toBe('Totally Unknown Header')
  })

  it('shows raw enum values in English and translates them in Arabic via enumLabel()', async () => {
    await i18n.changeLanguage('en')
    expect(enumLabel('in_progress')).toBe('in_progress')
    await i18n.changeLanguage('ar')
    expect(enumLabel('approved')).toBe('معتمد')
    expect(enumLabel('full_time')).toBe('دوام كامل')
    expect(enumLabel('brand_new_status')).toBe('brand_new_status') // unknown values fall back to the raw value
    expect(enumLabel('a.b')).toBe('a.b') // values that look like nested keys are never looked up
    expect(enumLabel(null)).toBe('')
    expect(enumLabel(undefined)).toBe('')
  })

  it('pluralises the HR day counts (all six Arabic forms)', async () => {
    await i18n.changeLanguage('ar')
    const d = (count: number) => i18n.t('hr.empLeave.day', { count })
    expect(d(1)).toBe('يوم واحد')
    expect(d(2)).toBe('يومان')
    expect(d(3)).toBe('3 أيام')
    expect(d(11)).toBe('11 يومًا')
    expect(d(100)).toBe('100 يوم')
  })

  it('keeps the client-chosen project tab names in English in every language', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.t('proj.detail.preliminaryEngineering')).toBe('Preliminary Engineering')
    expect(i18n.t('proj.detail.planningDetailedEngineering')).toBe('Planning & Detailed Engineering')
    expect(i18n.t('proj.detail.biddingStage')).toBe('Bidding Stage')
  })
})
