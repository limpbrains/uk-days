import { useTranslation } from 'react-i18next'
import type { ProfileError } from '../data/loadProfiles'

export function ErrorBanner({ errors }: { errors: ProfileError[] }) {
  const { t } = useTranslation()
  if (errors.length === 0) return null
  return (
    <div className="card banner" role="alert">
      {errors.map((e) => (
        <div key={e.file}>
          <code>{e.file}</code> {t('errors.skipped')}
          <ul>{e.errors.map((msg) => <li key={msg}>{msg}</li>)}</ul>
        </div>
      ))}
    </div>
  )
}
