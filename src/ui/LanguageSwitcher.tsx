import { useTranslation } from 'react-i18next'
import { LANGUAGES, LANGUAGE_NAMES, type Language } from '../i18n'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = ((i18n.resolvedLanguage ?? i18n.language).slice(0, 2) as Language) || 'en'
  return (
    <select className="lang" aria-label={t('app.language')} value={current} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
      {LANGUAGES.map((lng) => (
        <option key={lng} value={lng}>{LANGUAGE_NAMES[lng]}</option>
      ))}
    </select>
  )
}
