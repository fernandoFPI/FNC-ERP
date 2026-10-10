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
