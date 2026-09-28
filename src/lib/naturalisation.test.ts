import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULES,
  addMonths,
  addYears,
  budget,
  buildTimeline,
  checkDate,
  countAbsent,
  createContext,
  earliestEligible,
  fromDay,
  fullDaysAbsent,
  isAbsent,
  isIsoDate,
  lastYearStartFor,
  normalizeAbsences,
  shiftCurve,
  targetDay,
  toDay,
  windowStartFor,
  withExtra,
  type Absence,
  type Profile,
} from './naturalisation'

// ───────────────────────── helpers ─────────────────────────

function profile(absences: Absence[], overrides: Partial<Profile> = {}): Profile {
  return { id: 'me', name: 'Me', arrivedUK: '2022-09-01', rules: DEFAULT_RULES, absences, ...overrides }
}

/** One trip whose full-days count equals `days`, first absent day = the day after `out`. */
function trip(out: string, days: number, note?: string): Absence {
  return { out, in: fromDay(toDay(out) + days + 1), note }
}

const d = toDay

// ───────────────────────── dates ─────────────────────────

describe('toDay / fromDay', () => {
  it('round-trips an ISO date', () => {
    expect(fromDay(toDay('2022-09-01'))).toBe('2022-09-01')
  })

  it('counts consecutive days as +1 across month, leap day and DST changes', () => {
    expect(d('2024-03-01') - d('2024-02-29')).toBe(1)
    expect(d('2024-02-29') - d('2024-02-28')).toBe(1)
    expect(d('2024-03-31') - d('2024-03-30')).toBe(1)
    expect(d('2024-10-27') - d('2024-10-26')).toBe(1)
    expect(d('2025-01-01') - d('2024-12-31')).toBe(1)
  })

  it('throws on malformed input', () => {
    expect(() => toDay('2024-2-9')).toThrow(/Invalid ISO date/)
  })
})

describe('addYears / addMonths', () => {
  it('adds years keeping month and day', () => {
    expect(fromDay(addYears(d('2022-09-01'), 5))).toBe('2027-09-01')
  })

  it('clamps Feb 29 to Feb 28 on a non-leap year and keeps it on a leap year', () => {
    expect(fromDay(addYears(d('2024-02-29'), 1))).toBe('2025-02-28')
    expect(fromDay(addYears(d('2024-02-29'), 4))).toBe('2028-02-29')
    expect(fromDay(addYears(d('2024-02-29'), -4))).toBe('2020-02-29')
  })

  it('subtracts months and years across a year boundary', () => {
    expect(fromDay(addMonths(d('2027-09-01'), -12))).toBe('2026-09-01')
    expect(fromDay(addMonths(d('2027-01-15'), -1))).toBe('2026-12-15')
    expect(fromDay(addMonths(d('2026-12-15'), 1))).toBe('2027-01-15')
  })

  it('clamps the day when the target month is shorter', () => {
    expect(fromDay(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28')
    expect(fromDay(addMonths(d('2024-01-31'), 1))).toBe('2024-02-29')
    expect(fromDay(addMonths(d('2026-03-31'), -1))).toBe('2026-02-28')
  })
})

describe('isIsoDate', () => {
  it('accepts real YYYY-MM-DD dates', () => {
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2023-12-31')).toBe(true)
  })

  it('rejects malformed, impossible or non-string values', () => {
    expect(isIsoDate('2024-2-9')).toBe(false)
    expect(isIsoDate('2023-02-29')).toBe(false)
    expect(isIsoDate('2023-13-01')).toBe(false)
    expect(isIsoDate('2023-04-31')).toBe(false)
    expect(isIsoDate('2023/04/01')).toBe(false)
    expect(isIsoDate('hello')).toBe(false)
    expect(isIsoDate(20230401)).toBe(false)
    expect(isIsoDate(null)).toBe(false)
  })
})

// ───────────────────────── absences ─────────────────────────

describe('fullDaysAbsent', () => {
  it('does not count departure and arrival days (Home Office example)', () => {
    expect(fullDaysAbsent('2024-09-22', '2024-09-23')).toBe(0)
  })

  it('counts whole days between departure and arrival', () => {
    expect(fullDaysAbsent('2023-01-10', '2023-01-20')).toBe(9)
    expect(fullDaysAbsent('2023-01-10', '2023-01-12')).toBe(1)
  })

  it('is zero for a same-day return and for an inverted range', () => {
    expect(fullDaysAbsent('2024-05-05', '2024-05-05')).toBe(0)
    expect(fullDaysAbsent('2024-05-05', '2024-05-01')).toBe(0)
  })

  it('counts a leap day', () => {
    expect(fullDaysAbsent('2024-02-28', '2024-03-01')).toBe(1)
    expect(fullDaysAbsent('2023-02-28', '2023-03-01')).toBe(0)
  })
})

describe('normalizeAbsences', () => {
  const arrived = '2022-09-01'

  it('sorts by departure date and computes day numbers', () => {
    const { spans, errors } = normalizeAbsences(
      [
        { out: '2023-06-01', in: '2023-06-10' },
        { out: '2023-01-10', in: '2023-01-20', note: 'Dubai' },
      ],
      arrived,
    )
    expect(errors).toEqual([])
    expect(spans.map((s) => s.note ?? '')).toEqual(['Dubai', ''])
    expect(spans[0].days).toBe(9)
    expect(spans[0]).not.toHaveProperty('note', undefined)
  })

  it('returns no spans for an empty list', () => {
    expect(normalizeAbsences([], arrived)).toEqual({ spans: [], errors: [] })
  })

  it('reports overlapping absences and returns no spans', () => {
    const { spans, errors } = normalizeAbsences(
      [
        { out: '2023-01-10', in: '2023-01-20' },
        { out: '2023-01-15', in: '2023-01-25' },
      ],
      arrived,
    )
    expect(spans).toEqual([])
    expect(errors[0]).toMatch(/absence #2 .*overlaps.*#1/)
  })

  it('reports a trip fully inside another', () => {
    const { errors } = normalizeAbsences(
      [
        { out: '2023-01-10', in: '2023-01-30' },
        { out: '2023-01-15', in: '2023-01-20' },
      ],
      arrived,
    )
    expect(errors[0]).toMatch(/overlaps/)
  })

  it('allows returning and leaving on the same day', () => {
    const { errors, spans } = normalizeAbsences(
      [
        { out: '2023-01-10', in: '2023-01-20' },
        { out: '2023-01-20', in: '2023-01-25' },
      ],
      arrived,
    )
    expect(errors).toEqual([])
    expect(spans.map((s) => s.days)).toEqual([9, 4])
  })

  it('allows a zero-day trip and a trip departing on the arrival day', () => {
    const { errors } = normalizeAbsences(
      [
        { out: '2022-09-01', in: '2022-09-02' },
        { out: '2024-09-22', in: '2024-09-23' },
      ],
      arrived,
    )
    expect(errors).toEqual([])
  })

  it('reports return before departure', () => {
    const { errors } = normalizeAbsences([{ out: '2023-01-20', in: '2023-01-10' }], arrived)
    expect(errors[0]).toMatch(/absence #1 .*"in" .*before "out"/)
  })

  it('reports malformed dates with the original index', () => {
    const { errors } = normalizeAbsences(
      [
        { out: '2023-01-01', in: '2023-01-05' },
        { out: '2023/01/20', in: '2023-01-25' },
      ],
      arrived,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/absence #2 .*invalid date/)
  })

  it('reports departure before arrival in the UK', () => {
    const { errors } = normalizeAbsences([{ out: '2022-08-20', in: '2022-08-25' }], arrived)
    expect(errors[0]).toMatch(/absence #1 .*before arrivedUK/)
  })

  it('accepts one open-ended trip (no "in") as the last trip', () => {
    const { spans, errors } = normalizeAbsences([{ out: '2023-01-10', in: '2023-01-20' }, { out: '2026-08-18' }], arrived)
    expect(errors).toEqual([])
    expect(spans[1]).toEqual({ out: d('2026-08-18'), in: null, days: null })
  })

  it('rejects a trip after an open-ended one and more than one open-ended trip', () => {
    expect(normalizeAbsences([{ out: '2026-08-18' }, { out: '2026-09-01', in: '2026-09-05' }], arrived).errors[0]).toMatch(/absence #2 .*overlaps.*#1/)
    expect(normalizeAbsences([{ out: '2026-08-18' }, { out: '2026-09-01' }], arrived).errors[0]).toMatch(/absence #2 .*overlaps.*#1/)
  })

  it('treats an empty "in" string as open-ended', () => {
    const { spans, errors } = normalizeAbsences([{ out: '2026-08-18', in: '' }], arrived)
    expect(errors).toEqual([])
    expect(spans[0].in).toBeNull()
  })

  it('collects several independent errors at once', () => {
    const { errors } = normalizeAbsences(
      [
        { out: '2022-08-20', in: '2022-08-25' },
        { out: '2023-01-20', in: '2023-01-10' },
      ],
      arrived,
    )
    expect(errors).toHaveLength(2)
  })
})

// ───────────────────────── timeline ─────────────────────────

describe('buildTimeline / countAbsent / isAbsent', () => {
  const arrivedDay = d('2022-09-01')
  const horizon = d('2030-09-01')
  const tl = (absences: Absence[]) => {
    const { spans, errors } = normalizeAbsences(absences, '2022-09-01')
    if (errors.length) throw new Error(errors.join('; '))
    return buildTimeline(spans, arrivedDay, horizon)
  }

  it('counts zero for an empty profile', () => {
    expect(countAbsent(tl([]), d('2022-09-01'), d('2027-09-01'))).toBe(0)
  })

  it('marks only full days between out and in', () => {
    const t = tl([{ out: '2023-01-10', in: '2023-01-20' }])
    expect(isAbsent(t, d('2023-01-10'))).toBe(false)
    expect(isAbsent(t, d('2023-01-11'))).toBe(true)
    expect(isAbsent(t, d('2023-01-19'))).toBe(true)
    expect(isAbsent(t, d('2023-01-20'))).toBe(false)
  })

  it('counts an inclusive range and sums multiple trips', () => {
    const t = tl([
      { out: '2023-01-10', in: '2023-01-20' },
      { out: '2023-03-01', in: '2023-03-05' },
    ])
    expect(countAbsent(t, d('2023-01-11'), d('2023-01-19'))).toBe(9)
    expect(countAbsent(t, d('2023-01-12'), d('2023-01-15'))).toBe(4)
    expect(countAbsent(t, d('2022-09-01'), d('2024-01-01'))).toBe(9 + 3)
  })

  it('clamps ranges outside the timeline and returns zero for an inverted range', () => {
    const t = tl([{ out: '2023-01-10', in: '2023-01-20' }])
    expect(countAbsent(t, d('2000-01-01'), d('2099-01-01'))).toBe(9)
    expect(isAbsent(t, d('2000-01-01'))).toBe(false)
    expect(isAbsent(t, d('2099-01-01'))).toBe(false)
    expect(countAbsent(t, d('2023-01-19'), d('2023-01-11'))).toBe(0)
  })

  it('truncates a trip that runs past the horizon', () => {
    const t = tl([{ out: '2030-08-20', in: '2030-12-01' }])
    expect(countAbsent(t, d('2030-08-01'), d('2031-01-01'))).toBe(d('2030-09-01') - d('2030-08-21') + 1)
  })

  it('marks an open-ended trip as absent through the end of the timeline by default', () => {
    const t = tl([{ out: '2026-08-18' }])
    expect(isAbsent(t, d('2026-08-18'))).toBe(false)
    expect(isAbsent(t, d('2026-08-19'))).toBe(true)
    expect(isAbsent(t, horizon)).toBe(true)
    expect(countAbsent(t, d('2026-08-19'), horizon)).toBe(horizon - d('2026-08-19') + 1)
  })

  it('cuts an open-ended trip at openUntil', () => {
    const { spans } = normalizeAbsences([{ out: '2026-08-18' }], '2022-09-01')
    const t = buildTimeline(spans, arrivedDay, horizon, d('2026-09-28'))
    expect(isAbsent(t, d('2026-09-28'))).toBe(true)
    expect(isAbsent(t, d('2026-09-29'))).toBe(false)
    expect(countAbsent(t, arrivedDay, horizon)).toBe(d('2026-09-28') - d('2026-08-19') + 1)
  })

  it('total equals the sum of span days when everything is inside the horizon', () => {
    const absences = [trip('2023-01-01', 10), trip('2024-05-05', 1), trip('2025-12-31', 40)]
    const { spans } = normalizeAbsences(absences, '2022-09-01')
    const t = buildTimeline(spans, arrivedDay, horizon)
    expect(countAbsent(t, arrivedDay, horizon)).toBe(spans.reduce((n, s) => n + (s.days ?? 0), 0))
  })
})

// ───────────────────────── eligibility ─────────────────────────

describe('createContext', () => {
  it('rejects a profile with invalid absences', () => {
    expect(() => createContext(profile([{ out: '2023-01-20', in: '2023-01-10' }]))).toThrow(/absence #1/)
  })

  it('accepts a profile without ilrDate', () => {
    expect(createContext(profile([])).ilrDay).toBeNull()
  })
})

describe('checkDate: qualifying window', () => {
  it('passes with no absences at arrival + 5 years', () => {
    const r = checkDate(createContext(profile([])), d('2027-09-01'))
    expect(r.ok).toBe(true)
    expect(r.violations).toEqual([])
    expect(fromDay(r.windowStart)).toBe('2022-09-02')
  })

  it('window is [D - 5 years + 1 day, D] and the arrival day itself qualifies as its start', () => {
    const ctx = createContext(profile([]))
    expect(checkDate(ctx, d('2027-08-30')).violations).toContain('notInUkAtStart')
    expect(checkDate(ctx, d('2027-08-31')).ok).toBe(true)
    expect(fromDay(windowStartFor(ctx, d('2027-08-31')))).toBe('2022-09-01')
  })

  it('handles a Feb 29 arrival', () => {
    const ctx = createContext(profile([], { arrivedUK: '2024-02-29' }))
    // Window for 2029-02-27 starts 2024-02-28 (before arrival); for 2029-02-28 it starts 2024-03-01.
    expect(checkDate(ctx, d('2029-02-27')).violations).toContain('notInUkAtStart')
    expect(checkDate(ctx, d('2029-02-28')).ok).toBe(true)
    expect(fromDay(targetDay(ctx))).toBe('2029-02-28')
  })

  it('target is always the first eligible day for arrivals around leap years', () => {
    for (const [arrived, years, expected] of [
      ['2023-03-01', 5, '2028-02-29'],
      ['2027-03-01', 5, '2032-02-29'],
      ['2025-03-01', 3, '2028-02-29'],
      ['2023-03-01', 1, '2024-02-29'],
      ['2024-02-29', 1, '2025-02-28'],
      ['2022-09-01', 5, '2027-08-31'],
    ] as const) {
      const ctx = createContext(profile([], { arrivedUK: arrived, rules: { ...DEFAULT_RULES, windowYears: years } }))
      const T = targetDay(ctx)
      expect(fromDay(T), `${arrived} +${years}`).toBe(expected)
      expect(checkDate(ctx, T).ok).toBe(true)
      expect(checkDate(ctx, T - 1).ok).toBe(false)
    }
  })

  it('fails when absent on the first day of the window, passes on the return day', () => {
    const ctx = createContext(profile([{ out: '2022-09-20', in: '2022-09-30' }]))
    // window starts 2022-09-25, a full day abroad
    expect(checkDate(ctx, d('2027-09-24')).violations).toContain('notInUkAtStart')
    // window starts on the departure day 2022-09-20 → in the UK
    expect(checkDate(ctx, d('2027-09-19')).violations).not.toContain('notInUkAtStart')
    // window starts on the return day 2022-09-30 → in the UK
    expect(checkDate(ctx, d('2027-09-29')).violations).not.toContain('notInUkAtStart')
  })
})

describe('checkDate: 450-day rule', () => {
  it('allows exactly 450 days but not 451', () => {
    const ok = createContext(profile([trip('2023-01-01', 450)]))
    const bad = createContext(profile([trip('2023-01-01', 451)]))
    expect(checkDate(ok, d('2027-09-01')).totalAbsent).toBe(450)
    expect(checkDate(ok, d('2027-09-01')).violations).not.toContain('total')
    expect(checkDate(bad, d('2027-09-01')).violations).toContain('total')
  })

  it('ignores absences that fall before the window', () => {
    // 100 full days: 2022-09-02..2022-12-10
    const ctx = createContext(profile([trip('2022-09-01', 100), trip('2024-01-01', 400)]))
    expect(checkDate(ctx, d('2027-09-01')).totalAbsent).toBe(500)
    // Window from 2022-12-11 excludes the first trip entirely.
    const later = checkDate(ctx, d('2027-12-10'))
    expect(fromDay(later.windowStart)).toBe('2022-12-11')
    expect(later.totalAbsent).toBe(400)
    expect(later.ok).toBe(true)
  })

  it('counts a trip that straddles the application day only up to that day', () => {
    // 20 full days: 2027-08-22..2027-09-10
    const ctx = createContext(profile([trip('2027-08-21', 20)]))
    expect(checkDate(ctx, d('2027-09-01')).totalAbsent).toBe(11)
    expect(checkDate(ctx, d('2027-09-01')).lastYearAbsent).toBe(11)
  })

  it('respects custom limits (3-year spouse route)', () => {
    const rules = { ...DEFAULT_RULES, windowYears: 3, totalLimit: 270 }
    const ok = createContext(profile([trip('2023-01-01', 270)], { rules }))
    const bad = createContext(profile([trip('2023-01-01', 271)], { rules }))
    expect(checkDate(ok, d('2025-09-01')).ok).toBe(true)
    expect(fromDay(checkDate(ok, d('2025-09-01')).windowStart)).toBe('2022-09-02')
    expect(checkDate(bad, d('2025-09-01')).violations).toEqual(['total'])
  })
})

describe('checkDate: 90-day rule', () => {
  it('allows exactly 90 days in the last 12 months but not 91', () => {
    const ok = createContext(profile([trip('2027-01-01', 90)]))
    const bad = createContext(profile([trip('2027-01-01', 91)]))
    expect(checkDate(ok, d('2027-09-01')).lastYearAbsent).toBe(90)
    expect(checkDate(ok, d('2027-09-01')).violations).not.toContain('lastYear')
    expect(checkDate(bad, d('2027-09-01')).violations).toEqual(['lastYear'])
  })

  it('last-12-months window is [D - 12 months + 1, D]', () => {
    // 5 full days: 2026-09-01..2026-09-05
    const ctx = createContext(profile([{ out: '2026-08-31', in: '2026-09-06' }]))
    expect(checkDate(ctx, d('2027-08-31')).lastYearAbsent).toBe(5)
    expect(checkDate(ctx, d('2027-09-01')).lastYearAbsent).toBe(4)
    expect(checkDate(ctx, d('2027-09-05')).lastYearAbsent).toBe(0)
  })

  it('sums several short trips in the last year', () => {
    const ctx = createContext(profile([trip('2026-10-01', 30), trip('2027-01-01', 30), trip('2027-04-01', 31)]))
    expect(checkDate(ctx, d('2027-09-01')).lastYearAbsent).toBe(91)
    expect(checkDate(ctx, d('2027-09-01')).violations).toEqual(['lastYear'])
  })

  it('handles Feb 29 in the 12-month window on a leap year', () => {
    const ctx = createContext(profile([{ out: '2028-02-28', in: '2028-03-01' }]))
    // The 12 months ending 2029-02-28 start on 2028-03-01, so 2028-02-29 is outside.
    expect(checkDate(ctx, d('2029-02-27')).lastYearAbsent).toBe(1)
    expect(checkDate(ctx, d('2029-02-28')).lastYearAbsent).toBe(0)
    expect(checkDate(ctx, d('2029-03-01')).lastYearAbsent).toBe(0)
  })

  it('windows are exactly N years/months long: start + N = day + 1', () => {
    const ctx = createContext(profile([]))
    for (const iso of ['2029-02-28', '2028-02-29', '2028-03-01', '2027-08-31', '2030-01-31']) {
      const D = d(iso)
      expect(addYears(windowStartFor(ctx, D), 5)).toBe(D + 1)
      expect(addMonths(lastYearStartFor(D), 12)).toBe(D + 1)
    }
  })
})

describe('checkDate: ILR rule', () => {
  it('requires ILR held for 12 months', () => {
    const ctx = createContext(profile([], { ilrDate: '2026-10-01' }))
    expect(checkDate(ctx, d('2027-09-30')).violations).toContain('ilr')
    expect(checkDate(ctx, d('2027-10-01')).violations).not.toContain('ilr')
  })

  it('honours rules.ilrMonths (spouse route: no 12-month wait)', () => {
    const rules = { ...DEFAULT_RULES, windowYears: 3, totalLimit: 270, ilrMonths: 0 }
    const ctx = createContext(profile([], { ilrDate: '2026-06-01', rules }))
    expect(checkDate(ctx, d('2026-05-31')).violations).toContain('ilr')
    expect(checkDate(ctx, d('2026-06-01')).violations).not.toContain('ilr')
  })

  it('is skipped when the profile has no ilrDate', () => {
    expect(checkDate(createContext(profile([])), d('2027-09-01')).violations).toEqual([])
  })

  it('can report several violations at once', () => {
    const ctx = createContext(profile([trip('2024-01-01', 400), trip('2026-10-01', 91)], { ilrDate: '2027-01-01' }))
    expect(checkDate(ctx, d('2027-09-01')).violations).toEqual(['total', 'lastYear', 'ilr'])
  })
})

describe('withExtra', () => {
  it('adds a hypothetical block of full days abroad', () => {
    const ctx = withExtra(createContext(profile([])), { startDay: d('2027-01-01'), days: 10 })
    const r = checkDate(ctx, d('2027-09-01'))
    expect(r.totalAbsent).toBe(10)
    expect(r.lastYearAbsent).toBe(10)
  })

  it('does not double count days already absent', () => {
    const ctx = withExtra(createContext(profile([trip('2027-01-01', 10)])), { startDay: d('2027-01-05'), days: 10 })
    // existing: 01-02..01-11 (10 days); extra: 01-05..01-14 → union 01-02..01-14 = 13
    expect(checkDate(ctx, d('2027-09-01')).totalAbsent).toBe(13)
  })

  it('with zero days or null is identical to the base context', () => {
    const base = createContext(profile([trip('2024-01-01', 100)]))
    expect(checkDate(withExtra(base, { startDay: d('2027-01-01'), days: 0 }), d('2027-09-01')).totalAbsent).toBe(100)
    expect(checkDate(withExtra(base, null), d('2027-09-01')).totalAbsent).toBe(100)
  })

  it('can be replaced, not stacked', () => {
    const a = withExtra(createContext(profile([])), { startDay: d('2027-01-01'), days: 10 })
    const b = withExtra(a, { startDay: d('2027-03-01'), days: 5 })
    expect(checkDate(b, d('2027-09-01')).totalAbsent).toBe(5)
  })

  it('can make the window start day absent', () => {
    const ctx = withExtra(createContext(profile([])), { startDay: d('2022-09-02'), days: 3 })
    expect(checkDate(ctx, d('2027-09-01')).violations).toContain('notInUkAtStart')
    expect(checkDate(ctx, d('2027-09-04')).ok).toBe(true)
  })
})

describe('earliestEligible', () => {
  const from = d('2026-09-28')

  it('is the day before arrival + 5 years with no absences', () => {
    expect(fromDay(earliestEligible(createContext(profile([])), from)!)).toBe('2027-08-31')
  })

  it('never returns a day before fromDay, even when earlier days qualify', () => {
    const ctx = createContext(profile([]))
    expect(fromDay(earliestEligible(ctx, d('2028-03-15'))!)).toBe('2028-03-15')
  })

  it('clamps fromDay to the arrival day', () => {
    expect(fromDay(earliestEligible(createContext(profile([])), d('2000-01-01'))!)).toBe('2027-08-31')
  })

  it('is pushed by the 90-day rule until the block ages out', () => {
    // 100 full days abroad: 2026-10-01..2027-01-08
    const ctx = createContext(profile([trip('2026-09-30', 100)]))
    // First 10 absent days (Oct 1..10) must leave the 12-month window → D = 2027-10-10.
    expect(fromDay(earliestEligible(ctx, from)!)).toBe('2027-10-10')
  })

  it('is pushed by the 450-day rule as old trips fall out of the window', () => {
    // 10 full days 2022-10-02..10-11, then 445 more → 455 total.
    const ctx = createContext(profile([trip('2022-10-01', 10), trip('2023-06-01', 445)]))
    // Dropping 5 days would suffice, but the window must start on a day in the UK,
    // so it starts on the return day 2022-10-12 → D = 2027-10-11.
    expect(fromDay(earliestEligible(ctx, from)!)).toBe('2027-10-11')
  })

  it('drops old trips one by one when several separate trips must fall out', () => {
    // Three 10-day trips in year 1, then 440 → 470. Need ≥ 20 dropped → first two trips.
    const ctx = createContext(profile([trip('2022-10-01', 10), trip('2022-11-01', 10), trip('2022-12-01', 10), trip('2024-01-01', 440)]))
    // Second trip: 2022-11-02..11-11; window may start on return day 2022-11-12 → D = 2027-11-11.
    expect(fromDay(earliestEligible(ctx, from)!)).toBe('2027-11-11')
  })

  it('cannot partially age out a single long trip (must be in the UK on window start)', () => {
    // 460 full days: 2022-10-02..2024-01-04 → window can only start on 2024-01-05.
    const ctx = createContext(profile([trip('2022-10-01', 460)]))
    expect(fromDay(earliestEligible(ctx, from)!)).toBe('2029-01-04')
  })

  it('is pushed by ILR + 12 months', () => {
    const ctx = createContext(profile([], { ilrDate: '2027-03-15' }))
    expect(fromDay(earliestEligible(ctx, from)!)).toBe('2028-03-15')
  })

  it('returns null when nothing in the horizon qualifies', () => {
    const ctx = createContext(profile([trip('2022-09-02', 2800)]))
    expect(earliestEligible(ctx, from)).toBeNull()
  })
})

describe('shiftCurve', () => {
  const ctx = createContext(profile([trip('2024-01-01', 200)]))
  const from = d('2026-09-28')

  it('starts at the unshifted date and never moves earlier as N grows', () => {
    const curve = shiftCurve(ctx, d('2026-09-29'), from, 365)
    expect(curve).toHaveLength(366)
    expect(curve[0]).toEqual({ days: 0, eligibleDay: earliestEligible(ctx, from) })
    for (let i = 1; i < curve.length; i++) {
      const prev = curve[i - 1].eligibleDay
      const cur = curve[i].eligibleDay
      if (prev !== null && cur !== null) expect(cur).toBeGreaterThanOrEqual(prev)
    }
  })

  it('matches a direct computation at every point', () => {
    const start = d('2026-09-29')
    const curve = shiftCurve(ctx, start, from, 120)
    for (const p of curve) {
      expect(p.eligibleDay).toBe(earliestEligible(withExtra(ctx, { startDay: start, days: p.days }), from))
    }
  })

  it('shifts exactly when the 90-day rule is exceeded', () => {
    const curve = shiftCurve(createContext(profile([])), d('2026-09-29'), from, 100)
    const unshifted = curve[0].eligibleDay
    expect(curve[90].eligibleDay).toBe(unshifted)
    expect(curve[91].eligibleDay).toBeGreaterThan(unshifted!)
  })

  it('fills the tail with null once the horizon is exceeded', () => {
    const heavy = createContext(profile([trip('2022-09-02', 2400)]))
    const curve = shiftCurve(heavy, d('2026-09-29'), from, 10)
    expect(curve.every((p) => p.eligibleDay === null)).toBe(true)
    expect(curve).toHaveLength(11)
  })
})

describe('open-ended trips in eligibility', () => {
  const today = d('2026-09-28')

  it('without today, the trip never ends and no date qualifies', () => {
    const ctx = createContext(profile([{ out: '2026-08-18' }]))
    expect(earliestEligible(ctx, today)).toBeNull()
  })

  it('with today, the trip is assumed to end tomorrow', () => {
    // 41 full days: 2026-08-19..2026-09-28; 28 of them (Sep 1..28) fall in the last year of the default target.
    const ctx = createContext(profile([{ out: '2026-08-18' }]), today)
    expect(checkDate(ctx, d('2027-08-31')).totalAbsent).toBe(41)
    expect(checkDate(ctx, d('2027-08-31')).lastYearAbsent).toBe(28)
    expect(fromDay(earliestEligible(ctx, today)!)).toBe('2027-08-31')
    expect(budget(ctx, d('2027-08-31'), today)).toEqual({ usedActual: 41, usedPlanned: 0, remaining: 409, lastYearUsed: 28 })
  })

  it('what-if days stack on top of the open trip from tomorrow', () => {
    const ctx = withExtra(createContext(profile([{ out: '2026-08-18' }]), today), { startDay: today + 1, days: 63 })
    expect(checkDate(ctx, d('2027-08-31')).lastYearAbsent).toBe(28 + 63)
    expect(checkDate(ctx, d('2027-08-31')).violations).toEqual(['lastYear'])
  })
})

describe('horizon', () => {
  const today = d('2026-09-28')

  it('finds today for someone who arrived long ago with no absences', () => {
    const ctx = createContext(profile([], { arrivedUK: '2015-01-01' }), today)
    expect(fromDay(earliestEligible(ctx, today)!)).toBe('2026-09-28')
  })

  it('still counts trips near a far-future applicationDate', () => {
    const ctx = createContext(profile([trip('2030-01-01', 500)], { applicationDate: '2032-01-01' }), today)
    const r = checkDate(ctx, d('2032-01-01'))
    expect(r.totalAbsent).toBe(500)
    expect(r.ok).toBe(false)
  })

  it('extends past a late ILR date', () => {
    const ctx = createContext(profile([], { arrivedUK: '2015-01-01', ilrDate: '2031-06-01' }), today)
    expect(fromDay(earliestEligible(ctx, today)!)).toBe('2032-06-01')
  })

  it('default target for long-time residents is the earliest eligible day, not before today', () => {
    expect(fromDay(targetDay(createContext(profile([], { arrivedUK: '2015-01-01' }), today)))).toBe('2026-09-28')
    // 100 full days abroad ending 2026-09-05 push the earliest date (90-day rule) past today; target follows it.
    const ctx = createContext(profile([trip('2026-05-27', 100)], { arrivedUK: '2015-01-01' }), today)
    expect(targetDay(ctx)).toBe(earliestEligible(ctx, today))
    expect(targetDay(ctx)).toBeGreaterThan(today)
    expect(fromDay(targetDay(createContext(profile([], { arrivedUK: '2015-01-01' }))))).toBe('2019-12-31')
  })
})

describe('targetDay / budget', () => {
  it('target is the day before arrival + windowYears', () => {
    expect(fromDay(targetDay(createContext(profile([]))))).toBe('2027-08-31')
    expect(fromDay(targetDay(createContext(profile([], { rules: { ...DEFAULT_RULES, windowYears: 3 } }))))).toBe('2025-08-31')
  })

  it('target follows an explicit applicationDate when the profile has one', () => {
    const ctx = createContext(profile([], { applicationDate: '2028-03-15' }))
    expect(fromDay(targetDay(ctx))).toBe('2028-03-15')
  })

  it('splits used days into actual and planned relative to today', () => {
    const ctx = createContext(profile([trip('2024-01-01', 100), trip('2027-01-01', 50)]))
    expect(budget(ctx, d('2027-09-01'), d('2026-09-28'))).toEqual({ usedActual: 100, usedPlanned: 50, remaining: 300, lastYearUsed: 50 })
  })

  it('splits a trip that straddles today', () => {
    // 10 full days: 2026-09-24..2026-10-03; today 2026-09-28 → 5 actual (24..28), 5 planned
    const ctx = createContext(profile([trip('2026-09-23', 10)]))
    const b = budget(ctx, d('2027-09-01'), d('2026-09-28'))
    expect(b.usedActual).toBe(5)
    expect(b.usedPlanned).toBe(5)
  })

  it('treats everything as actual when today is past the application day', () => {
    const ctx = createContext(profile([trip('2024-01-01', 100)]))
    const b = budget(ctx, d('2027-09-01'), d('2028-01-01'))
    expect(b).toEqual({ usedActual: 100, usedPlanned: 0, remaining: 350, lastYearUsed: 0 })
  })

  it('reports a negative remaining budget when over the limit', () => {
    const ctx = createContext(profile([trip('2024-01-01', 500)]))
    expect(budget(ctx, d('2027-09-01'), d('2026-09-28')).remaining).toBe(-50)
  })
})

// ───────────────────────── brute-force oracle ─────────────────────────

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('checkDate agrees with a day-by-day brute force on random trips', () => {
  const rand = mulberry32(42)
  const arrived = '2022-09-01'

  for (let run = 0; run < 25; run++) {
    it(`random profile #${run}`, () => {
      const absences: Absence[] = []
      let cursor = d(arrived) + Math.floor(rand() * 30)
      while (absences.length < 12 && cursor < d('2028-06-01')) {
        const out = cursor + Math.floor(rand() * 60)
        const len = Math.floor(rand() * 60) // in - out
        absences.push({ out: fromDay(out), in: fromDay(out + len) })
        cursor = out + len
      }
      const ctx = createContext(profile(absences))
      const abroad = new Set<number>()
      for (const a of absences) for (let x = d(a.out) + 1; x < d(a.in!); x++) abroad.add(x)

      for (let k = 0; k < 20; k++) {
        const D = d('2027-06-01') + Math.floor(rand() * 500)
        const r = checkDate(ctx, D)
        const ws = addYears(D + 1, -5)
        const ls = addMonths(D + 1, -12)
        let total = 0
        let last = 0
        for (let x = ws; x <= D; x++) if (abroad.has(x)) { total++; if (x >= ls) last++ }
        expect(r.totalAbsent).toBe(total)
        expect(r.lastYearAbsent).toBe(last)
        const expected = [
          ...(ws < d(arrived) || abroad.has(ws) ? ['notInUkAtStart'] : []),
          ...(total > 450 ? ['total'] : []),
          ...(last > 90 ? ['lastYear'] : []),
        ]
        expect(r.violations).toEqual(expected)
      }
    })
  }
})
