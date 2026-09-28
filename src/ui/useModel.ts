import { useMemo } from 'react'
import { toDay, budget, checkDate, createContext, earliestEligible, shiftCurve, targetDay, withExtra, type Budget, type CheckResult, type Context, type CurvePoint, type Profile } from '../lib/naturalisation'

export interface WhatIf {
  extraDays: number
  /** ISO date of the first hypothetical full day abroad. */
  extraStart: string
}

export interface Model {
  profile: Profile
  today: number
  /** Profile absences only. */
  base: Context
  /** Profile absences plus the hypothetical block. */
  all: Context
  target: number
  earliestBase: number | null
  earliestAll: number | null
  /** Budget for applying on the target date, profile absences only. */
  budgetBase: Budget
  /** Same, including the hypothetical block. */
  budgetAll: Budget
  /** Full days of the hypothetical block that fall inside the target window. */
  extraAtTarget: number
  checkAtTarget: CheckResult
  checkAtEarliest: CheckResult | null
  curve: CurvePoint[]
}

export function useModel(profile: Profile, today: number, whatIf: WhatIf): Model {
  const base = useMemo(() => createContext(profile, today), [profile, today])
  const extraStartDay = toDay(whatIf.extraStart)
  const all = useMemo(
    () => withExtra(base, { startDay: extraStartDay, days: whatIf.extraDays }),
    [base, extraStartDay, whatIf.extraDays],
  )
  const curve = useMemo(() => shiftCurve(base, extraStartDay, today), [base, extraStartDay, today])

  return useMemo(() => {
    const target = targetDay(base)
    const earliestAll = earliestEligible(all, today)
    const budgetBase = budget(base, target, today)
    const budgetAll = budget(all, target, today)
    const extraAtTarget = budgetBase.remaining - budgetAll.remaining
    return {
      profile,
      today,
      base,
      all,
      target,
      earliestBase: earliestEligible(base, today),
      earliestAll,
      budgetBase,
      budgetAll,
      extraAtTarget,
      checkAtTarget: checkDate(all, target),
      checkAtEarliest: earliestAll === null ? null : checkDate(all, earliestAll),
      curve,
    }
  }, [profile, today, base, all, curve])
}
