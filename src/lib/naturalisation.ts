/**
 * UK naturalisation residence calculator.
 *
 * Pure, dependency-free logic for the absence rules a naturalisation
 * application must meet (section 6(1) of the British Nationality Act 1981,
 * as applied by Home Office guidance):
 *
 *  - qualifying period `[D - windowYears + 1 day, D]` for an application on day D;
 *    the applicant must be in the UK on its first day;
 *  - at most `totalLimit` whole days absent in that period;
 *  - at most `lastYearLimit` whole days absent in `[D - 12 months + 1 day, D]`;
 *  - ILR / settled status held for at least `ilrMonths` months on day D.
 *
 * Whole days only: the days of departure and arrival count as in the UK.
 * Dates are ISO `YYYY-MM-DD` strings at the API boundary and integer
 * "days since the Unix epoch" (UTC) inside, so no DST or timezone issues.
 */

// ───────────────────────── types ─────────────────────────

export interface Absence {
  /** Date of leaving the UK (ISO YYYY-MM-DD). Not counted as absent. */
  out: string
  /** Date of returning to the UK (ISO YYYY-MM-DD). Not counted as absent. Omit or leave empty while still abroad. */
  in?: string
  note?: string
}

export interface Rules {
  windowYears: number
  totalLimit: number
  lastYearLimit: number
  softLimit: number
  hardLimit: number
  lastYearSoftLimit: number
  /** Months ILR must have been held on the application day (12 on the 5-year route, 0 for spouses of British citizens). */
  ilrMonths: number
}

export const DEFAULT_RULES: Rules = {
  windowYears: 5,
  totalLimit: 450,
  lastYearLimit: 90,
  softLimit: 480,
  hardLimit: 900,
  lastYearSoftLimit: 100,
  ilrMonths: 12,
}

export interface Profile {
  id: string
  name: string
  arrivedUK: string
  ilrDate?: string
  /** Planned application day (ISO). When set, it replaces the default target of arrival + windowYears. */
  applicationDate?: string
  rules: Rules
  absences: Absence[]
}

/** Absence in day-number form, sorted and validated. */
export interface AbsenceSpan {
  out: number
  /** Return day, or null for an open-ended trip (still abroad). */
  in: number | null
  /** Full days absent: max(0, in - out - 1); null while the trip is open. */
  days: number | null
  note?: string
}

// ───────────────────────── dates ─────────────────────────

const MS_PER_DAY = 86_400_000
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function toDay(iso: string): number {
  const m = ISO_RE.exec(iso)
  if (!m) throw new Error(`Invalid ISO date: ${iso}`)
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_PER_DAY)
}

export function fromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = ISO_RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [+m[1], +m[2], +m[3]]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

export function addMonths(day: number, months: number): number {
  const dt = new Date(day * MS_PER_DAY)
  const y = dt.getUTCFullYear()
  const m0 = dt.getUTCMonth() + months
  const targetY = y + Math.floor(m0 / 12)
  const targetM = ((m0 % 12) + 12) % 12
  const d = Math.min(dt.getUTCDate(), daysInMonth(targetY, targetM))
  return Math.floor(Date.UTC(targetY, targetM, d) / MS_PER_DAY)
}

export function addYears(day: number, years: number): number {
  return addMonths(day, years * 12)
}

/**
 * Calendar difference from `from` to `to`: whole months counted from `from`'s day of month,
 * then the remaining days. Negative when `to` is earlier. 2026-02-01 → 2026-03-04 is 1 month 3 days.
 */
export function calendarDelta(from: number, to: number): { months: number; days: number } {
  if (to < from) {
    const r = calendarDelta(to, from)
    return { months: -r.months, days: -r.days }
  }
  let months = 0
  while (addMonths(from, months + 1) <= to) months++
  return { months, days: to - addMonths(from, months) }
}

// ───────────────────────── absences ─────────────────────────

/** Whole days outside the UK. Departure and arrival days count as in the UK. */
export function fullDaysAbsent(out: string, back: string): number {
  return Math.max(0, toDay(back) - toDay(out) - 1)
}

export interface NormalizeResult {
  spans: AbsenceSpan[]
  errors: string[]
}

/**
 * Validates raw absences and converts them to sorted day spans.
 * On any error, `spans` is empty so a broken profile is never half-used.
 */
export function normalizeAbsences(absences: Absence[], arrivedUK: string): NormalizeResult {
  const errors: string[] = []
  const arrivedDay = toDay(arrivedUK)
  const indexed = absences.map((a, i) => ({ a, n: i + 1 }))

  const isOpen = (a: Absence) => a.in === undefined || a.in === ''
  const label = (a: Absence) => `${a.out} → ${isOpen(a) ? '…' : a.in}`

  for (const { a, n } of indexed) {
    if (!isIsoDate(a.out) || (!isOpen(a) && !isIsoDate(a.in))) {
      errors.push(`absence #${n} (${label(a)}): invalid date, expected YYYY-MM-DD`)
      continue
    }
    if (!isOpen(a) && toDay(a.in!) < toDay(a.out)) {
      errors.push(`absence #${n} (${label(a)}): "in" is before "out"`)
    }
    if (toDay(a.out) < arrivedDay) {
      errors.push(`absence #${n} (${label(a)}): departs before arrivedUK ${arrivedUK}`)
    }
  }
  if (errors.length) return { spans: [], errors }

  const sorted = [...indexed].sort((x, y) => toDay(x.a.out) - toDay(y.a.out))
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    if (isOpen(prev.a) || toDay(cur.a.out) < toDay(prev.a.in!)) {
      errors.push(`absence #${cur.n} (${label(cur.a)}) overlaps absence #${prev.n} (${label(prev.a)})`)
    }
  }
  if (errors.length) return { spans: [], errors }

  const spans: AbsenceSpan[] = sorted.map(({ a }) => ({
    out: toDay(a.out),
    in: isOpen(a) ? null : toDay(a.in!),
    days: isOpen(a) ? null : fullDaysAbsent(a.out, a.in!),
    ...(a.note !== undefined ? { note: a.note } : {}),
  }))
  return { spans, errors }
}

// ───────────────────────── timeline ─────────────────────────

export interface Timeline {
  /** First day covered (inclusive). */
  startDay: number
  /** Last day covered (inclusive). */
  endDay: number
  /** absent[i] = 1 when day (startDay + i) was a full day outside the UK. */
  absent: Uint8Array
  /** prefix[i] = number of absent days among the first i days. Length = days + 1. */
  prefix: Int32Array
}

/**
 * @param openUntil last absent day of an open-ended trip (normally "today": the traveller is
 *   assumed to return the day after). Defaults to the end of the timeline.
 */
export function buildTimeline(spans: AbsenceSpan[], startDay: number, endDay: number, openUntil = endDay): Timeline {
  const length = Math.max(0, endDay - startDay + 1)
  const absent = new Uint8Array(length)
  for (const s of spans) {
    const from = Math.max(s.out + 1, startDay)
    const to = Math.min(s.in === null ? openUntil : s.in - 1, endDay)
    for (let d = from; d <= to; d++) absent[d - startDay] = 1
  }
  const prefix = new Int32Array(length + 1)
  for (let i = 0; i < length; i++) prefix[i + 1] = prefix[i] + absent[i]
  return { startDay, endDay, absent, prefix }
}

export function isAbsent(tl: Timeline, day: number): boolean {
  if (day < tl.startDay || day > tl.endDay) return false
  return tl.absent[day - tl.startDay] === 1
}

/** Absent days in the inclusive range [from, to], clamped to the timeline. */
export function countAbsent(tl: Timeline, from: number, to: number): number {
  const a = Math.max(from, tl.startDay)
  const b = Math.min(to, tl.endDay)
  if (b < a) return 0
  return tl.prefix[b - tl.startDay + 1] - tl.prefix[a - tl.startDay]
}

// ───────────────────────── eligibility ─────────────────────────

export interface Context {
  rules: Rules
  arrivedDay: number
  ilrDay: number | null
  applicationDay: number | null
  /** Last absent day of an open-ended trip (see createContext). */
  openUntil: number
  spans: AbsenceSpan[]
  tl: Timeline
  /** Hypothetical block of full days abroad layered on top of the profile, if any. */
  extra: Extra | null
}

export interface Extra {
  /** First full day abroad of the hypothetical block. */
  startDay: number
  days: number
}

export type Violation = 'notInUkAtStart' | 'total' | 'lastYear' | 'ilr'

export interface CheckResult {
  ok: boolean
  day: number
  windowStart: number
  lastYearStart: number
  totalAbsent: number
  lastYearAbsent: number
  violations: Violation[]
}

/** Years past the latest anchor date the timeline extends, on top of one full qualifying window. */
const HORIZON_EXTRA_YEARS = 3

/**
 * Last day of the timeline: one qualifying window plus 3 years past the latest of arrival,
 * today, the planned date and ILR + wait — enough for a window that can only start after an
 * assumed return from a long open-ended trip.
 */
function horizonEnd(base: Omit<Context, 'tl' | 'extra'>): number {
  const anchors = [
    base.arrivedDay,
    Number.isFinite(base.openUntil) ? base.openUntil : base.arrivedDay,
    base.applicationDay ?? base.arrivedDay,
    base.ilrDay === null ? base.arrivedDay : addMonths(base.ilrDay, base.rules.ilrMonths),
  ]
  return addYears(Math.max(...anchors), base.rules.windowYears + HORIZON_EXTRA_YEARS)
}

function build(base: Omit<Context, 'tl' | 'extra'>, extra: Extra | null): Context {
  const endDay = horizonEnd(base)
  const all = extra && extra.days > 0
    ? [...base.spans, { out: extra.startDay - 1, in: extra.startDay + extra.days, days: extra.days }]
    : base.spans
  return { ...base, tl: buildTimeline(all, base.arrivedDay, endDay, base.openUntil), extra }
}

/**
 * Throws with the validation messages when the profile's absences are invalid.
 * @param today an open-ended trip (no "in") counts as absent through this day and is assumed to
 *   end the day after; omit it to treat such a trip as lasting to the end of the horizon.
 */
export function createContext(profile: Profile, today = Number.POSITIVE_INFINITY): Context {
  const { spans, errors } = normalizeAbsences(profile.absences, profile.arrivedUK)
  if (errors.length) throw new Error(errors.join('\n'))
  return build(
    {
      rules: profile.rules,
      arrivedDay: toDay(profile.arrivedUK),
      ilrDay: profile.ilrDate ? toDay(profile.ilrDate) : null,
      applicationDay: profile.applicationDate ? toDay(profile.applicationDate) : null,
      openUntil: today,
      spans,
    },
    null,
  )
}

export function withExtra(ctx: Context, extra: Extra | null): Context {
  return build(ctx, extra)
}

/**
 * First day of the qualifying period ending on `day`: the period is exactly windowYears long,
 * i.e. start + windowYears = day + 1 (so it is computed from the day after the application).
 * Around 29 February this differs from "day − N years + 1".
 */
export function windowStartFor(ctx: Context, day: number): number {
  return addYears(day + 1, -ctx.rules.windowYears)
}

/** First day of the 12 months ending on `day` (start + 12 months = day + 1). */
export function lastYearStartFor(day: number): number {
  return addMonths(day + 1, -12)
}

export function checkDate(ctx: Context, day: number): CheckResult {
  const { rules, tl } = ctx
  const windowStart = windowStartFor(ctx, day)
  const lastYearStart = lastYearStartFor(day)
  const totalAbsent = countAbsent(tl, windowStart, day)
  const lastYearAbsent = countAbsent(tl, lastYearStart, day)
  const violations: Violation[] = []
  if (windowStart < ctx.arrivedDay || isAbsent(tl, windowStart)) violations.push('notInUkAtStart')
  if (totalAbsent > rules.totalLimit) violations.push('total')
  if (lastYearAbsent > rules.lastYearLimit) violations.push('lastYear')
  if (ctx.ilrDay !== null && day < addMonths(ctx.ilrDay, rules.ilrMonths)) violations.push('ilr')
  return { ok: violations.length === 0, day, windowStart, lastYearStart, totalAbsent, lastYearAbsent, violations }
}

/** First day ≥ fromDay on which an application would meet every rule, or null within the horizon. */
export function earliestEligible(ctx: Context, fromDay: number): number | null {
  for (let d = Math.max(fromDay, ctx.arrivedDay); d <= ctx.tl.endDay; d++) {
    if (checkDate(ctx, d).ok) return d
  }
  return null
}

export interface CurvePoint {
  days: number
  eligibleDay: number | null
}

/** Earliest application date as a function of N extra full days abroad starting at extraStartDay. */
export function shiftCurve(ctx: Context, extraStartDay: number, fromDay: number, maxDays = 365): CurvePoint[] {
  const points: CurvePoint[] = []
  // More days abroad can never make an earlier date eligible, so each scan
  // may start where the previous one stopped.
  let from = fromDay
  for (let days = 0; days <= maxDays; days++) {
    const eligibleDay = earliestEligible(withExtra(ctx, { startDay: extraStartDay, days }), from)
    points.push({ days, eligibleDay })
    if (eligibleDay === null) {
      for (let d = days + 1; d <= maxDays; d++) points.push({ days: d, eligibleDay: null })
      break
    }
    from = eligibleDay
  }
  return points
}

/**
 * The planned application day if set, else the first day whose qualifying window starts on the
 * arrival day — but never earlier than today when today is known (long-time residents).
 */
/** First day whose qualifying window does not start before the arrival day (leap years can shift it by one). */
export function arrivalTargetDay(ctx: Context): number {
  const t = addYears(ctx.arrivedDay - 1, ctx.rules.windowYears)
  return windowStartFor(ctx, t) < ctx.arrivedDay ? t + 1 : t
}

export function targetDay(ctx: Context): number {
  if (ctx.applicationDay !== null) return ctx.applicationDay
  const byArrival = arrivalTargetDay(ctx)
  if (!Number.isFinite(ctx.openUntil) || byArrival >= ctx.openUntil) return byArrival
  // Long-time resident: the natural target is behind us, so aim at the first day that qualifies.
  return earliestEligible(ctx, ctx.openUntil) ?? ctx.openUntil
}

export interface Budget {
  usedActual: number
  usedPlanned: number
  remaining: number
  lastYearUsed: number
}

/** Absence budget for an application on `day`, split at `today` into actual and planned. */
export function budget(ctx: Context, day: number, today: number): Budget {
  const windowStart = windowStartFor(ctx, day)
  const usedActual = countAbsent(ctx.tl, windowStart, Math.min(today, day))
  const usedPlanned = countAbsent(ctx.tl, Math.max(today + 1, windowStart), day)
  return {
    usedActual,
    usedPlanned,
    remaining: ctx.rules.totalLimit - usedActual - usedPlanned,
    lastYearUsed: countAbsent(ctx.tl, lastYearStartFor(day), day),
  }
}
