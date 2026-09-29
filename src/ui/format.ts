import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../i18n'
import { calendarDelta, isIsoDate } from '../lib/naturalisation'
import { fromDay } from '../lib/naturalisation'

function utc(day: number): Date {
  return new Date(fromDay(day) + 'T00:00:00Z')
}

export interface Formatters {
  day: (day: number | null) => string
  monthYear: (day: number) => string
  /** Human calendar delta from one day to another, e.g. "+3 mo 12 d", "no shift", "−5 d". */
  delta: (from: number, to: number) => string
}

/** Locale-aware date and delta formatters for the active language. */
export function useFormat(): Formatters {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  return useMemo(() => {
    // Intl formats the whole date (so month names are declined and CJK/Arabic orders are right);
    // Russian's trailing " г." is trimmed so values fit the cards.
    const full = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    const year = (day: number) => utc(day).getUTCFullYear()
    const monthYear = (day: number) => `${monthName(day, locale)} ${year(day)}`
    return {
      day: (day) => (day === null ? t('delta.beyondHorizon') : full.format(utc(day)).replace(/\s*г\.$/, '')),
      monthYear,
      delta: (from, to) => {
        if (from === to) return t('delta.none')
        const sign = to > from ? '+' : '−'
        const { months, days } = calendarDelta(Math.min(from, to), Math.max(from, to))
        if (months === 0) return t('delta.days', { sign, count: days })
        if (days === 0) return t('delta.months', { sign, count: months })
        return t('delta.monthsDays', { sign, months, days })
      },
    }
  }, [t, locale])
}

/** Short month name for a day, in the active locale. */
export function monthName(day: number, locale: string): string {
  return utc(day).toLocaleString(locale, { month: 'short', timeZone: 'UTC' })
}

/** Today in the user's local calendar as an epoch day, overridable via ?today=YYYY-MM-DD for testing. */
export function todayDay(): number {
  const param = new URLSearchParams(window.location.search).get('today')
  if (isIsoDate(param)) return Math.floor(Date.parse(param + 'T00:00:00Z') / 86_400_000)
  const now = new Date()
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000)
}
