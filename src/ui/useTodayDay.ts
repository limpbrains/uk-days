import { useEffect, useState } from 'react'
import { isIsoDate } from '../lib/naturalisation'
import { todayDay } from './format'

/**
 * Today as an epoch day. Re-evaluates at local midnight and when the tab becomes visible again,
 * so an open tab does not keep yesterday's date. A `?today=` override stays fixed.
 */
export function useTodayDay(): number {
  const [today, setToday] = useState(todayDay)
  useEffect(() => {
    if (isIsoDate(new URLSearchParams(window.location.search).get('today'))) return
    const refresh = () => setToday(todayDay())
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
    const timer = setTimeout(refresh, midnight + 1000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [today])
  return today
}
