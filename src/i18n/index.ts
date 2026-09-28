import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { ar } from './ar'
import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import { hi } from './hi'
import { it } from './it'
import { pl } from './pl'
import { pt } from './pt'
import { ro } from './ro'
import { ru } from './ru'
import { tr } from './tr'
import { uk } from './uk'
import { zh } from './zh'

export const LANGUAGES = ['en', 'ru', 'uk', 'pl', 'ro', 'es', 'pt', 'it', 'fr', 'de', 'tr', 'zh', 'ar', 'hi'] as const
export type Language = (typeof LANGUAGES)[number]

/** Native names for the language menu. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  ru: 'Русский',
  uk: 'Українська',
  pl: 'Polski',
  ro: 'Română',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
  fr: 'Français',
  de: 'Deutsch',
  tr: 'Türkçe',
  zh: '中文',
  ar: 'العربية',
  hi: 'हिन्दी',
}

/** Intl locale used for dates in each language. */
const DATE_LOCALES: Record<Language, string> = {
  en: 'en-GB',
  ru: 'ru-RU',
  uk: 'uk-UA',
  pl: 'pl-PL',
  ro: 'ro-RO',
  es: 'es-ES',
  pt: 'pt-PT',
  it: 'it-IT',
  fr: 'fr-FR',
  de: 'de-DE',
  tr: 'tr-TR',
  zh: 'zh-CN',
  ar: 'ar-EG',
  hi: 'hi-IN',
}

export const LANG_STORAGE_KEY = 'uk-days:lang'

export function dateLocale(lng: string): string {
  return DATE_LOCALES[lng.slice(0, 2) as Language] ?? 'en-GB'
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  document.documentElement.dir = i18n.dir(lng)
})

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ru: { translation: ru }, uk: { translation: uk }, pl: { translation: pl }, ro: { translation: ro }, es: { translation: es }, pt: { translation: pt }, it: { translation: it }, fr: { translation: fr }, de: { translation: de }, tr: { translation: tr }, zh: { translation: zh }, ar: { translation: ar }, hi: { translation: hi } },
    supportedLngs: LANGUAGES,
    fallbackLng: 'en',
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LANG_STORAGE_KEY,
    },
    interpolation: { escapeValue: false },
  })

export default i18n
