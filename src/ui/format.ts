import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../i18n'
import { fromDay } from '../lib/naturalisation'

function utc(day: number): Date {
  return new Date(fromDay(day) + 'T00:00:00Z')
}

export interface Formatters {
  day: (day: number | null) => string
  monthYear: (day: number) => string
  /** Human delta between two days, e.g. "+3 mo 12 d", "no shift", "−5 d". */
  delta: (days: number) => string
}

/** Locale-aware date and delta formatters for the active language. */
export function useFormat(): Formatters {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  return useMemo(() => {
    // Built by hand so Russian reads "22 сент. 2027" rather than "22 сент. 2027 г.";
    // day + month go through Intl together so the month is declined ("1 мая", not "1 май").
    const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    const year = (day: number) => utc(day).getUTCFullYear()
    const monthYear = (day: number) => `${monthName(day, locale)} ${year(day)}`
    return {
      day: (day) => (day === null ? t('delta.beyondHorizon') : `${dayMonth.format(utc(day))} ${year(day)}`),
      monthYear,
      delta: (days) => {
        if (days === 0) return t('delta.none')
        const sign = days > 0 ? '+' : '−'
        const abs = Math.abs(days)
        const months = Math.floor(abs / 30.44)
        const rest = Math.round(abs - months * 30.44)
        if (months === 0) return t('delta.days', { sign, count: abs })
        if (rest === 0) return t('delta.months', { sign, count: months })
        return t('delta.monthsDays', { sign, months, days: rest })
      },
    }
  }, [t, locale])
}

/** Short month name for a day, in the active locale. */
export function monthName(day: number, locale: string): string {
  return utc(day).toLocaleString(locale, { month: 'short', timeZone: 'UTC' })
}

/** Today as an epoch day (UTC), overridable via ?today=YYYY-MM-DD for testing. */
export function todayDay(): number {
  const param = new URLSearchParams(window.location.search).get('today')
  const iso = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : new Date().toISOString().slice(0, 10)
  return Math.floor(Date.parse(iso + 'T00:00:00Z') / 86_400_000)
}
