import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import ar from './locales/ar.json'

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export function isRtl(lng: string | undefined): boolean {
  return (lng ?? '').startsWith('ar')
}

/** True while the active UI language is right-to-left. Re-renders on language change. */
export function useIsRtl(): boolean {
  const { i18n: instance } = useTranslation()
  return isRtl(instance.resolvedLanguage)
}

/** Display label for a navigation entry; `label` is the English text and doubles as the key. */
export function navLabel(label: string): string {
  return i18n.t(`nav.${label}`, { defaultValue: label })
}

/** Translate a label from a small closed set (status, type…) with the English text as fallback. */
export function tl(group: string, key: string, fallback: string): string {
  return i18n.t(`${group}.${key}`, { defaultValue: fallback })
}

/**
 * Display label for a raw enum value that comes straight from the API/DB (status, type, method…), e.g. 'in_progress'.
 * English shows the value exactly as before; other languages read it from the `enum.*` group. Logic must keep using
 * the raw value, never this label.
 */
export function enumLabel(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  if (/[.:]/.test(value)) return value // would be read as a nested key / namespace
  return i18n.t(`enum.${value}`, { defaultValue: value })
}

/** Translate a table-header style label; the key is `<group>.hdr_<letters-and-digits of the text>`. */
export function tlh(group: string, text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]/g, '')
  // A slug that is itself a CLDR plural word (zero/one/two/few/many/other) would make `hdr_<slug>` read as a plural form.
  const safe = /^(zero|one|two|few|many|other)$/.test(slug) ? `${slug}Text` : slug
  return i18n.t(`${group}.hdr_${safe}`, { defaultValue: text })
}

/** Keeps <html dir/lang> in sync with the active language. */
function applyDocumentDirection(lng: string) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('lang', isRtl(lng) ? 'ar' : 'en')
  root.setAttribute('dir', isRtl(lng) ? 'rtl' : 'ltr')
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'fnc-language',
      caches: ['localStorage'],
    },
  })
  .then(() => {
    applyDocumentDirection(i18n.resolvedLanguage ?? 'en')
  })

i18n.on('languageChanged', applyDocumentDirection)

export default i18n
